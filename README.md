# 🚀 LunaStream

**Fast. Smooth. Real-time.**

LunaStream is a high-performance, low-latency screen sharing application built with **WebRTC** and **Flask-SocketIO**. It's designed for seamless sharing between devices on a local network with near-zero delay.

## ✨ Features
- **Ultra-Low Latency**: Direct P2P streaming using WebRTC.
- **60 FPS Performance**: Optimized for smooth motion and real-time interaction.
- **Premium UI**: Sleek, glassmorphic dark-mode dashboard.
- **Easy Discovery**: Auto-generated QR codes and room codes for quick connection.
- **Performance Optimized**: Bitrate capping and adaptive quality for consistent speed.

## 🛠️ Tech Stack
- **Backend**: Python, Flask, Flask-SocketIO.
- **Frontend**: Vanilla JavaScript (WebRTC API), CSS (Glassmorphism), HTML5.
- **Signaling**: Socket.io.

## 🚀 Quick Start

1. **Clone and Setup**:
   ```bash
   git clone https://github.com/Ap-0007/LunaStream.git
   cd LunaStream
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the Server**:
   ```bash
   python server.py
   ```

4. **Start Sharing**:
   - Open `http://your-ip:5005` on your laptop.
   - Scan the QR code or enter the Room ID on your phone.

## 🔒 Security
- Peer-to-Peer local streaming ensures your screen data doesn't leave your network.
- No third-party servers involved except for initial signaling.

## 📄 License
MIT License - Feel free to use and modify!

---
*Created with ❤️ by Antigravity*
