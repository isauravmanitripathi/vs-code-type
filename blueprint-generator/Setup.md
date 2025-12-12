use this commamd to setup the entire thing on server at once 


sudo apt update -y && sudo apt upgrade -y && \
sudo apt install -y xvfb pulseaudio pavucontrol ffmpeg dbus-x11 xdotool python3-venv python3-pip wget gpg apt-transport-https && \
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg && \
sudo install -D -o root -g root -m 644 microsoft.gpg /usr/share/keyrings/microsoft.gpg && \
rm microsoft.gpg && \
echo "Types: deb
URIs: https://packages.microsoft.com/repos/code
Suites: stable
Components: main
Architectures: amd64,arm64,armhf
Signed-By: /usr/share/keyrings/microsoft.gpg" | sudo tee /etc/apt/sources.list.d/vscode.sources > /dev/null && \
sudo apt update && sudo apt install -y code && \
python3 -m venv .venv && \
./.venv/bin/pip install edge-tts gTTS

