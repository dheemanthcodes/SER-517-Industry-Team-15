# from fastapi import FastAPI, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from pi_service import get_bluetooth_data, scan_devices, get_paired_devices, pair_device, remove_device

# app = FastAPI(title="Pi Bluetooth API")

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# @app.get("/")
# def read_root():
#     return {"message": "Welcome to the Pi Bluetooth Backend API"}

# @app.get("/api/bluetooth")
# def fetch_bluetooth_info():
#     try:
#         data = get_bluetooth_data()
#         return {"status": "success", "data": data}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# @app.get("/api/bluetooth/scan")
# def api_scan_devices(seconds: int = 8):
#     print(f"[DEBUG] Received scan request for {seconds} seconds")
#     try:
#         data = scan_devices(duration=seconds)
#         print(f"[DEBUG] Scan successful: {data}")
#         return {"status": "success", "data": data}
#     except Exception as e:
#         print(f"[ERROR] Scan failed with exception: {e}")
#         raise HTTPException(status_code=500, detail=str(e))

# @app.get("/api/bluetooth/paired")
# def api_paired_devices():
#     try:
#         data = get_paired_devices()
#         return {"status": "success", "data": data}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# @app.post("/api/bluetooth/pair")
# def api_pair_device(payload: dict):
#     mac = payload.get('mac')
#     if not mac:
#         raise HTTPException(status_code=400, detail="Missing 'mac' in request body")
#     try:
#         result = pair_device(mac)
#         return {"status": "success", "result": result}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# @app.post("/api/bluetooth/remove")
# def api_remove_device(payload: dict):
#     mac = payload.get('mac')
#     if not mac:
#         raise HTTPException(status_code=400, detail="Missing 'mac' in request body")
#     try:
#         result = remove_device(mac)
#         return {"status": "success", "result": result}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

import paramiko
import re

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
        raise Exception(f"SSH Authentication failed. Error: {str(e)}")
    except paramiko.SSHException as e:
        raise Exception(f"SSH connection error: {e}")
    except socket.timeout:
        raise Exception(f"SSH connection timed out. Pi at {PI_HOST} may be unreachable")
    except socket.error as e:
        raise Exception(f"Cannot reach Pi at {PI_HOST}. Error: {str(e)}")
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

def get_bluetooth_data():
    try:
        output, err = _ssh_exec("bluetoothctl devices")
        if err:
            print(f"Pi error: {err}")
        devices = parse_bluetoothctl_devices(output)
        return {'scanned_devices': devices}
    except paramiko.AuthenticationException:
        raise Exception("Authentication failed.")
    except Exception as e:
        raise Exception(f"Failed to connect or fetch data from Pi: {str(e)}")

def scan_devices(duration=8):
    print(f"[DEBUG] Starting Bluetooth scan...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print(f"[DEBUG] Connecting to Pi...")
        ssh.connect(PI_HOST, username=PI_USER, password=PI_PASSWORD, timeout=30)
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

def get_paired_devices():
    try:
        output, err = _ssh_exec("bluetoothctl paired-devices")
        if err:
            print(f"Pi paired-devices error: {err}")
        devices = parse_bluetoothctl_devices(output)
        return {'paired_devices': devices}
    except Exception as e:
        raise Exception(f"Failed to get paired devices: {str(e)}")

def pair_device(mac_address):
    try:
        cmd = f'bash -lc "bluetoothctl pair {mac_address}; bluetoothctl trust {mac_address}; bluetoothctl connect {mac_address}"'
        output, err = _ssh_exec(cmd, timeout=30)
        if err:
            print(f"Pi pair error: {err}")
        return {'output': output, 'error': err}
    except Exception as e:
        raise Exception(f"Failed to pair device {mac_address}: {str(e)}")

def remove_device(mac_address):
    try:
        cmd = f'bluetoothctl disconnect {mac_address}; bluetoothctl untrust {mac_address}; bluetoothctl remove {mac_address}'
        output, err = _ssh_exec(cmd, timeout=30)
        if err:
            print(f"Pi remove error: {err}")
        if "not available" in output.lower() or "failed" in output.lower():
            print(f"[WARN] bluetoothctl output contained potential failure: {output}")
        return {'output': output, 'error': err}
    except Exception as e:
        raise Exception(f"Failed to remove device {mac_address}: {str(e)}")
