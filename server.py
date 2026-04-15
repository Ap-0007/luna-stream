import os
import socket
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
# Use a secret key for session security
app.config['SECRET_KEY'] = 'lunastream_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Store active rooms and their participants
# rooms = { room_id: { host: sid, viewers: [sid, ...] } }
rooms = {}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('create_room')
def on_create(data):
    room_id = data.get('room')
    if not room_id:
        return
    join_room(room_id)
    rooms[room_id] = {'host': request.sid, 'viewers': []}
    print(f"Room created: {room_id} by {request.sid}")
    emit('room_created', {'room': room_id})

@socketio.on('join_room')
def on_join(data):
    room_id = data.get('room')
    if room_id in rooms:
        join_room(room_id)
        if request.sid not in rooms[room_id]['viewers']:
            rooms[room_id]['viewers'].append(request.sid)
        
        print(f"Viewer {request.sid} joined room: {room_id}")
        # Notify the host that a viewer joined
        emit('viewer_joined', {'viewer_id': request.sid}, to=rooms[room_id]['host'])
        emit('joined_room', {'room': room_id})
    else:
        emit('error', {'message': 'Room not found'})

@socketio.on('signal')
def on_signal(data):
    """Relay WebRTC signals (offer, answer, candidate)"""
    room_id = data.get('room')
    target_id = data.get('target') # Specific peer to send to
    payload = data.get('payload')
    
    if target_id:
        # Direct signal to a specific peer
        emit('signal', {'sender': request.sid, 'payload': payload}, to=target_id)
    else:
        # Broadcast signal to the room (excluding sender)
        emit('signal', {'sender': request.sid, 'payload': payload}, to=room_id, include_self=False)

@socketio.on('disconnect')
def on_disconnect():
    # Cleanup rooms
    for room_id, info in list(rooms.items()):
        if info['host'] == request.sid:
            print(f"Host disconnected, closing room: {room_id}")
            emit('room_closed', {'room': room_id}, to=room_id)
            del rooms[room_id]
        elif request.sid in info['viewers']:
            info['viewers'].remove(request.sid)
            print(f"Viewer {request.sid} left room: {room_id}")
            emit('viewer_left', {'viewer_id': request.sid}, to=info['host'])

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

if __name__ == '__main__':
    ip_addr = get_local_ip()
    port = 5005
    url = f"http://{ip_addr}:{port}"
    
    print("\n" + "🚀" * 15)
    print(f" LUNASTREAM SERVER ")
    print(f" DASHBOARD: {url}")
    print("🚀" * 15)
    
    try:
        import qrcode
        qr = qrcode.QRCode()
        qr.add_data(url)
        print("\nScan this QR code on your phone to join:")
        qr.print_ascii(invert=True)
    except ImportError:
        print("\nTip: Install 'qrcode' to see a scanable code here.")
    
    print("\n" + "="*30 + "\n")
    
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
