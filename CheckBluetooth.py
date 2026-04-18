import bluetooth

target_mac = "XX:XX:XX:XX:XX:XX" 

print("Scanning...")

nearby_devices = bluetooth.discover_devices(duration=8, lookup_names=True)

found = False
for addr, name in nearby_devices:
    if addr == target_mac:
        print(f"Device found: {name} ({addr})")
        found = True
        break

if not found:
    print("Target Bluetooth device not found.")
