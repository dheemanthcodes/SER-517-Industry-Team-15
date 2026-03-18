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


Section 2: Setting Up RealVNC for Remote Desktop
With WiFi working, the next step was enabling remote desktop access via RealVNC. This involved enabling the VNC server on the Pi, configuring the viewer, and troubleshooting several common issues along the way.
2.1 Enabling the VNC Server
RealVNC Server comes pre-installed on Raspberry Pi OS Desktop. Enable it via raspi-config:
bashsudo raspi-config
Navigate to: Interface Options → VNC → Enable → Finish
Alternatively, enable it directly from the command line:
bashsudo systemctl enable vncserver-x11-serviced
sudo systemctl start vncserver-x11-serviced
Verify the VNC service is running:
bashsudo systemctl status vncserver-x11-serviced
2.2 Check the VNC Port
By default, RealVNC listens on port 5900. Confirm with:
bashsudo ss -tlnp | grep vnc
# or
sudo netstat -tlnp | grep 5900
2.3 Figuring Out the Viewer Side
On the connecting machine, download RealVNC Viewer from realvnc.com. When connecting:

Enter the Pi's IP address (e.g., 192.168.1.42) in the address bar
Use the default port 5900, or just enter the IP — VNC Viewer fills in the port automatically
For authentication, use your Pi's system username and password (default: pi / raspberry)


Common Issue: If you see Cannot currently show the desktop, the Pi may be booting to a virtual framebuffer with no display attached. See Section 2.4 below.

2.4 Troubleshooting — Cannot Show Desktop
This is one of the most common VNC issues on headless Pis. The VNC server needs a display to share, but without a physical monitor attached, it may not create one.
Fix 1: Set a Virtual Resolution
bashsudo raspi-config
# Display Options → VNC Resolution → Set to 1280x720
Fix 2: Force HDMI Output in config.txt
bashsudo nano /boot/config.txt
Add or uncomment these lines:
hdmi_force_hotplug=1
hdmi_group=2
hdmi_mode=85    # 1280x720 @ 60Hz
Fix 3: Restart VNC Service
bashsudo systemctl restart vncserver-x11-serviced
2.5 Troubleshooting — Authentication Failures
If VNC Viewer keeps rejecting credentials:

Ensure you're using the Pi's system username/password, not a RealVNC cloud account
Switch to direct (non-cloud) connection mode in VNC Viewer
Reset the VNC password if needed:

bashsudo vncpasswd -service
2.6 Connecting Without a RealVNC Account
RealVNC Viewer may prompt you to sign in to a cloud account. This is optional. To connect directly:

In VNC Viewer, choose Connect directly or type the IP address manually
Select Direct connection type when prompted
Authentication will use the Pi's system credentials

Once connected, you should see the Raspberry Pi desktop rendered in the VNC Viewer window.
