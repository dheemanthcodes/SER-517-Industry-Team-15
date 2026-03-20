import paramiko

PI_HOST = "172.20.10.8"     
PI_USER = "capstone"             
PI_PASSWORD = "firedept"   

def _ssh_exec(command, timeout=20):
    import socket
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(PI_HOST, username=PI_USER, password=PI_PASSWORD, timeout=10)
        stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
        out = stdout.read().decode('utf-8').strip()
        err = stderr.read().decode('utf-8').strip()
        return out, err
    except paramiko.AuthenticationException as e:
        raise Exception(f"SSH Authentication failed - check PI_USER and PI_PASSWORD. Error: {str(e)}")
    except paramiko.SSHException as e:
        raise Exception(f"SSH connection error: {e}")
    except socket.timeout:
        raise Exception(f"SSH connection timed out - Pi at {PI_HOST} may be unreachable")
    except socket.error as e:
        raise Exception(f"Cannot reach Pi at {PI_HOST} - check network connectivity. Error: {str(e)}")
    except Exception as e:
        raise Exception(f"SSH error: {str(e)}")
    finally:
        ssh.close()


import re

def parse_bluetoothctl_devices(output):
    devices = []
    if not output:
        return devices
    for line in output.split('\n'):
        line = line.strip()
        # Strip color coding or ANSI escapes just in case
        line = re.sub(r'\x1b\[[0-9;]*m', '', line)
        if not line:
            continue
        parts = line.split(' ', 2)
        if len(parts) >= 3 and parts[0] == 'Device':
            mac = parts[1]
            name = parts[2].strip()
            
            # Ensure the device has a real name (not empty and not just its MAC address)
            if name and name.replace('-', ':').upper() != mac.upper():
                devices.append({'mac_address': mac, 'name': name})
    return devices


def get_bluetooth_data():
    """Return currently known devices (same as 'bluetoothctl devices')."""
    try:
        output, err = _ssh_exec("bluetoothctl devices")
        if err:
            print(f"Pi error: {err}")
        devices = parse_bluetoothctl_devices(output)
        return {'scanned_devices': devices}
    except paramiko.AuthenticationException:
        raise Exception("Authentication failed, please verify the PI_USER and PI_PASSWORD in pi_service.py.")
    except Exception as e:
        raise Exception(f"Failed to connect or fetch data from Pi: {str(e)}")


def scan_devices(duration=8):
    """Start a scan on the Pi for `duration` seconds and return discovered devices."""
    print(f"[DEBUG] Starting Bluetooth scan...")
    
    # Use a single SSH connection for all commands
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print(f"[DEBUG] Connecting to Pi...")
        ssh.connect(PI_HOST, username=PI_USER, password=PI_PASSWORD, timeout=30)
        print(f"[DEBUG] Connected, executing commands...")
        
        # Step 1: Power on Bluetooth
        print("[DEBUG] Running: bluetoothctl power on")
        stdin, stdout, stderr = ssh.exec_command("bluetoothctl power on", timeout=30)
        output = stdout.read().decode('utf-8').strip()
        err = stderr.read().decode('utf-8').strip()
        print(f"[DEBUG] Power on output: '{output}', err: '{err}'")
        
        # Step 2: Start scan for `duration` seconds
        print(f"[DEBUG] Running: timeout {duration} bluetoothctl scan on")
        # Use timeout and get_pty=True to keep discovery alive for `duration` seconds
        stdin, stdout, stderr = ssh.exec_command(f"timeout {duration} bluetoothctl scan on", get_pty=True)
        # Block until the timeout stops the scan process
        stdout.read()
        
        # Step 3: Turn off scan just in case it is still running
        print("[DEBUG] Running: bluetoothctl scan off")
        ssh.exec_command("bluetoothctl scan off", timeout=30)
        
        # Step 4: Get discovered devices
        print("[DEBUG] Running: bluetoothctl devices")
        stdin, stdout, stderr = ssh.exec_command("bluetoothctl devices", timeout=30)
        output = stdout.read().decode('utf-8', errors='ignore').strip()
        err = stderr.read().decode('utf-8', errors='ignore').strip()
        print(f"[DEBUG] Devices output: '{output}', err: '{err}'")
        
        print(f"[DEBUG] Scan completed, parsing output...")
        devices = parse_bluetoothctl_devices(output)
        
        # Get paired devices to filter them out of scanned results
        print("[DEBUG] Fetching paired devices to exclude from scanned list...")
        stdin, stdout, stderr = ssh.exec_command("bluetoothctl paired-devices", timeout=30)
        paired_output = stdout.read().decode('utf-8', errors='ignore').strip()
        paired_devices = parse_bluetoothctl_devices(paired_output)
        paired_macs = {p.get('mac_address') for p in paired_devices if p.get('mac_address')}
        
        # Deduplicate devices by MAC address and filter out paired ones
        unique_devices = []
        seen_macs = set()
        for d in devices:
            mac = d.get('mac_address')
            if mac:
                if mac not in seen_macs and mac not in paired_macs:
                    seen_macs.add(mac)
                    unique_devices.append(d)
            else:
                unique_devices.append(d)
                
        print(f"[DEBUG] Found {len(unique_devices)} new unscanned devices")
        return {'scanned_devices': unique_devices}
        
    except Exception as e:
        print(f"[ERROR] scan_devices failed: {e}")
        raise Exception(f"Failed to scan devices on Pi: {str(e)}")
    finally:
        ssh.close()


def get_paired_devices():
    """Return paired devices (bluetoothctl paired-devices)."""
    try:
        output, err = _ssh_exec("bluetoothctl paired-devices")
        if err:
            print(f"Pi paired-devices error: {err}")
        devices = parse_bluetoothctl_devices(output)
        return {'paired_devices': devices}
    except Exception as e:
        raise Exception(f"Failed to get paired devices: {str(e)}")


def pair_device(mac_address):
    """Attempt to pair and trust a device by MAC address."""
    try:
        # Run pair, trust and connect commands; some devices may require interaction
        cmd = f'bash -lc "bluetoothctl pair {mac_address}; bluetoothctl trust {mac_address}; bluetoothctl connect {mac_address}"'
        output, err = _ssh_exec(cmd, timeout=30)
        if err:
            print(f"Pi pair error: {err}")
        return {'output': output, 'error': err}
    except Exception as e:
        raise Exception(f"Failed to pair device {mac_address}: {str(e)}")


def remove_device(mac_address):
    """Remove (remove/untrust) a paired device."""
    try:
        # Ensure the device is disconnected and untrusted before attempting to remove it.
        # Removing via standard shell sequential execution instead of `bash -lc` to avoid profile hangs.
        cmd = f'bluetoothctl disconnect {mac_address}; bluetoothctl untrust {mac_address}; bluetoothctl remove {mac_address}'
        output, err = _ssh_exec(cmd, timeout=30)
        
        if err:
            print(f"Pi remove error: {err}")
            
        # Optional: check if the CLI explicitly rejected the remove command
        if "not available" in output.lower() or "failed" in output.lower():
            print(f"[WARN] bluetoothctl output contained potential failure: {output}")
            
        return {'output': output, 'error': err}
    except Exception as e:
        raise Exception(f"Failed to remove device {mac_address}: {str(e)}")

