import paramiko
import re

PI_HOST = "172.20.10.8"     
PI_USER = "capstone"             
PI_PASSWORD = "firedept"   

def _resolve_pi_host(pi_host=None):
    return (pi_host or PI_HOST).strip()


def _ssh_exec(command, timeout=20, pi_host=None):
    import socket
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    target_host = _resolve_pi_host(pi_host)
    try:
        ssh.connect(target_host, username=PI_USER, password=PI_PASSWORD, timeout=10)
        stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
        out = stdout.read().decode('utf-8').strip()
        err = stderr.read().decode('utf-8').strip()
        return out, err
    except paramiko.AuthenticationException as e:
        raise Exception(f"SSH Authentication failed. Error: {str(e)}")
    except paramiko.SSHException as e:
        raise Exception(f"SSH connection error: {e}")
    except socket.timeout:
        raise Exception(f"SSH connection timed out. Pi at {target_host} may be unreachable")
    except socket.error as e:
        raise Exception(f"Cannot reach Pi at {target_host}. Error: {str(e)}")
    except Exception as e:
        raise Exception(f"SSH error: {str(e)}")
    finally:
        ssh.close()

def parse_bluetoothctl_devices(output):
    devices = []
    if not output:
        return devices
    for line in output.split('\n'):
        line = line.strip()
        line = re.sub(r'\x1b\[[0-9;]*m', '', line)
        if not line:
            continue
        parts = line.split(' ', 2)
        if len(parts) >= 3 and parts[0] == 'Device':
            mac = parts[1]
            name = parts[2].strip()
            if name and name.replace('-', ':').upper() != mac.upper():
                devices.append({'mac_address': mac, 'name': name})
    return devices

def get_bluetooth_data(pi_host=None):
    try:
        output, err = _ssh_exec("bluetoothctl devices", pi_host=pi_host)
        if err:
            print(f"Pi error: {err}")
        devices = parse_bluetoothctl_devices(output)
        return {'scanned_devices': devices}
    except paramiko.AuthenticationException:
        raise Exception("Authentication failed.")
    except Exception as e:
        raise Exception(f"Failed to connect or fetch data from Pi: {str(e)}")

def scan_devices(duration=8, pi_host=None):
    print(f"[DEBUG] Starting Bluetooth scan...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    target_host = _resolve_pi_host(pi_host)
    try:
        print(f"[DEBUG] Connecting to Pi...")
        ssh.connect(target_host, username=PI_USER, password=PI_PASSWORD, timeout=30)
        print(f"[DEBUG] Connected, executing commands...")
        print("[DEBUG] Running: bluetoothctl power on")
        stdin, stdout, stderr = ssh.exec_command("bluetoothctl power on", timeout=30)
        output = stdout.read().decode('utf-8').strip()
        err = stderr.read().decode('utf-8').strip()
        print(f"[DEBUG] Power on output: '{output}', err: '{err}'")
        print(f"[DEBUG] Running: timeout {duration} bluetoothctl scan on")
        stdin, stdout, stderr = ssh.exec_command(f"timeout {duration} bluetoothctl scan on", get_pty=True)
        stdout.read()
        print("[DEBUG] Running: bluetoothctl scan off")
        ssh.exec_command("bluetoothctl scan off", timeout=30)
        print("[DEBUG] Running: bluetoothctl devices")
        stdin, stdout, stderr = ssh.exec_command("bluetoothctl devices", timeout=30)
        output = stdout.read().decode('utf-8', errors='ignore').strip()
        err = stderr.read().decode('utf-8', errors='ignore').strip()
        print(f"[DEBUG] Devices output: '{output}', err: '{err}'")
        print(f"[DEBUG] Scan completed, parsing output...")
        devices = parse_bluetoothctl_devices(output)
        print("[DEBUG] Fetching paired devices...")
        stdin, stdout, stderr = ssh.exec_command("bluetoothctl paired-devices", timeout=30)
        paired_output = stdout.read().decode('utf-8', errors='ignore').strip()
        paired_devices = parse_bluetoothctl_devices(paired_output)
        paired_macs = {p.get('mac_address') for p in paired_devices if p.get('mac_address')}
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

def get_paired_devices(pi_host=None):
    try:
        output, err = _ssh_exec("bluetoothctl paired-devices", pi_host=pi_host)
        if err:
            print(f"Pi paired-devices error: {err}")
        devices = parse_bluetoothctl_devices(output)
        return {'paired_devices': devices}
    except Exception as e:
        raise Exception(f"Failed to get paired devices: {str(e)}")

def pair_device(mac_address, pi_host=None):
    try:
        cmd = f'bash -lc "bluetoothctl pair {mac_address}; bluetoothctl trust {mac_address}; bluetoothctl connect {mac_address}"'
        output, err = _ssh_exec(cmd, timeout=30, pi_host=pi_host)
        if err:
            print(f"Pi pair error: {err}")
        return {'output': output, 'error': err}
    except Exception as e:
        raise Exception(f"Failed to pair device {mac_address}: {str(e)}")

def remove_device(mac_address, pi_host=None):
    try:
        cmd = f'bluetoothctl disconnect {mac_address}; bluetoothctl untrust {mac_address}; bluetoothctl remove {mac_address}'
        output, err = _ssh_exec(cmd, timeout=30, pi_host=pi_host)
        if err:
            print(f"Pi remove error: {err}")
        if "not available" in output.lower() or "failed" in output.lower():
            print(f"[WARN] bluetoothctl output contained potential failure: {output}")
        return {'output': output, 'error': err}
    except Exception as e:
        raise Exception(f"Failed to remove device {mac_address}: {str(e)}")
