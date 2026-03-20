import bluetooth

print("Scanning for Bluetooth devices...")

nearby_devices = bluetooth.discover_devices(duration=8, lookup_names=True)

if nearby_devices:
    print("Found devices:")
    for addr, name in nearby_devices:
        print(f"Name: {name}, MAC Address: {addr}")
else:
    print("No Bluetooth devices found.")