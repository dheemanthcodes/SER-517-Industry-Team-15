Raspberry Pi Setup Guide
WiFi via Command Line · RealVNC Remote Desktop · Bluetooth via Commands

Table of Contents

1.Connecting to WiFi via Command Line
2.Setting Up RealVNC for Remote Desktop
3.Connecting a Bluetooth Device via Commands
4.Quick Reference Cheat Sheet


Section 1: Connecting to WiFi via Command Line
Before any remote access is possible, the Raspberry Pi needs a network connection. This section covers how to configure WiFi manually using command-line tools, without a GUI.
1.1 Prerequisites

Raspberry Pi running Raspberry Pi OS (Lite or Desktop)
Physical access to the Pi (keyboard + monitor, or UART serial)
Your WiFi SSID and password

1.2 Check the Wireless Interface
Verify that the wireless adapter is recognized by the system:
baship link show
# or
iwconfig
Look for an interface named wlan0 (or wlan1 for external adapters). If the interface is DOWN, bring it up:
bashsudo ip link set wlan0 up
1.3 Scan for Available Networks
Scan to confirm your network is visible to the Pi:
bashsudo iwlist wlan0 scan | grep ESSID
This lists all visible SSIDs. Confirm your network name appears in the output before proceeding.
1.4 Configure WiFi with wpa_supplicant
Edit the wpa_supplicant configuration file directly:
bashsudo nano /etc/wpa_supplicant/wpa_supplicant.conf
Add the following block at the end of the file:
network={
    ssid="YourNetworkName"
    psk="YourPassword"
    key_mgmt=WPA-PSK
}

Tip: Use wpa_passphrase to generate a hashed password instead of storing it in plain text:
bashsudo wpa_passphrase 'YourSSID' 'YourPassword' >> /etc/wpa_supplicant/wpa_supplicant.conf

1.5 Apply the Configuration
Reload the wpa_supplicant configuration and trigger a connection:
bashsudo wpa_cli -i wlan0 reconfigure
Alternatively, restart the networking service:
bashsudo systemctl restart dhcpcd
# or on newer OS versions:
sudo systemctl restart NetworkManager
1.6 Verify the Connection
Confirm an IP address has been assigned:
baship addr show wlan0
# or
hostname -I
Then test internet connectivity:
bashping -c 4 google.com
You should see an inet address under wlan0 and successful ping replies. Note your IP address — you'll need it for VNC.
1.7 Making WiFi Persistent Across Reboots
Ensure the relevant services are enabled on boot:
bashsudo systemctl enable dhcpcd
sudo systemctl enable wpa_supplicant
Reboot and verify the connection re-establishes automatically:
bashsudo reboot
# After reboot:
ping -c 4 8.8.8.8