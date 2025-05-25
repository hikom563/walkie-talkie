'use client';

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface Participant {
  id: string;
  name: string;
  isTalking: boolean;
}

export default function WalkieTalkie() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState('');
  const [userName, setUserName] = useState('');
  const [isTalking, setIsTalking] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [status, setStatus] = useState('Not Connected');
  const [statusType, setStatusType] = useState<'disconnected' | 'connected' | 'talking'>('disconnected');
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioRef = useRef<HTMLAudioElement>(null);

  // Initialize random username
  useEffect(() => {
    setUserName(`User${Math.floor(Math.random() * 1000)}`);
  }, []);

  const joinRoom = async () => {
    if (!room.trim() || !userName.trim()) {
      alert('Please enter both room name and your name');
      return;
    }

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });
      
      localStreamRef.current = stream;

      // Connect to WebSocket server
      const newSocket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001');
      
      setSocket(newSocket);

      newSocket.on('connect', () => {
        setIsConnected(true);
        setStatus(`Connected to room: ${room}`);
        setStatusType('connected');
        
        // Join the room
        newSocket.emit('join-room', { room, userName });
      });

      newSocket.on('user-joined', (data: { participants: Participant[] }) => {
        setParticipants(data.participants);
      });

      newSocket.on('user-left', (data: { participants: Participant[] }) => {
        setParticipants(data.participants);
      });

      newSocket.on('user-talking', (data: { userId: string, isTalking: boolean }) => {
        setParticipants(prev => 
          prev.map(p => 
            p.id === data.userId ? { ...p, isTalking: data.isTalking } : p
          )
        );
      });

      // WebRTC signaling
      newSocket.on('offer', async (data: { offer: RTCSessionDescriptionInit, from: string }) => {
        await handleOffer(data.offer, data.from, newSocket);
      });

      newSocket.on('answer', async (data: { answer: RTCSessionDescriptionInit, from: string }) => {
        const peer = peersRef.current.get(data.from);
        if (peer) {
          await peer.setRemoteDescription(data.answer);
        }
      });

      newSocket.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit, from: string }) => {
        const peer = peersRef.current.get(data.from);
        if (peer) {
          await peer.addIceCandidate(data.candidate);
        }
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
        setStatus('Disconnected');
        setStatusType('disconnected');
      });

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please allow microphone access and try again.');
    }
  };

  const createPeerConnection = (userId: string, socket: Socket) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Add local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peer.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote stream
    peer.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (audioRef.current) {
        audioRef.current.srcObject = remoteStream;
        audioRef.current.play();
      }
    };

    // Handle ICE candidates
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          candidate: event.candidate,
          to: userId,
          room
        });
      }
    };

    peersRef.current.set(userId, peer);
    return peer;
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit, from: string, socket: Socket) => {
    const peer = createPeerConnection(from, socket);
    await peer.setRemoteDescription(offer);
    
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    
    socket.emit('answer', {
      answer,
      to: from,
      room
    });
  };

  const startTalking = async () => {
    if (isTalking || !socket || !localStreamRef.current) return;

    setIsTalking(true);
    setStatus('Talking...');
    setStatusType('talking');

    // Notify others that we're talking
    socket.emit('start-talking', { room });

    // Create peer connections for all participants
    participants.forEach(async (participant) => {
      if (participant.id !== socket.id) {
        const peer = createPeerConnection(participant.id, socket);
        
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        
        socket.emit('offer', {
          offer,
          to: participant.id,
          room
        });
      }
    });
  };

  const stopTalking = () => {
    if (!isTalking || !socket) return;

    setIsTalking(false);
    setStatus(`Connected to room: ${room}`);
    setStatusType('connected');

    // Notify others that we stopped talking
    socket.emit('stop-talking', { room });

    // Close all peer connections
    peersRef.current.forEach(peer => {
      peer.close();
    });
    peersRef.current.clear();
  };

  const leaveRoom = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (socket) {
      socket.emit('leave-room', { room });
      socket.disconnect();
      setSocket(null);
    }

    peersRef.current.forEach(peer => peer.close());
    peersRef.current.clear();

    setIsConnected(false);
    setParticipants([]);
    setStatus('Not Connected');
    setStatusType('disconnected');
    setIsTalking(false);
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md text-white shadow-2xl border border-white/20">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-3">📻 Walkie-Talkie</h1>
            <div className={`p-4 rounded-2xl font-semibold ${
              statusType === 'disconnected' ? 'bg-red-500/30 border-2 border-red-400' :
              statusType === 'connected' ? 'bg-green-500/30 border-2 border-green-400' :
              'bg-yellow-500/30 border-2 border-yellow-400'
            }`}>
              {status}
            </div>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter room name (e.g., friends123)"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-full p-4 rounded-2xl bg-white/20 text-white placeholder-white/70 border-none outline-none text-lg"
              onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
            />
            <input
              type="text"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full p-4 rounded-2xl bg-white/20 text-white placeholder-white/70 border-none outline-none text-lg"
              onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
            />
            <button
              onClick={joinRoom}
              className="w-full p-4 rounded-2xl bg-gradient-to-r from-green-500 to-green-600 text-white font-bold text-lg hover:from-green-600 hover:to-green-700 transition-all duration-300 hover:scale-105 shadow-lg"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md text-white shadow-2xl border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3">📻 Walkie-Talkie</h1>
          <div className={`p-4 rounded-2xl font-semibold transition-all duration-300 ${
            statusType === 'disconnected' ? 'bg-red-500/30 border-2 border-red-400' :
            statusType === 'connected' ? 'bg-green-500/30 border-2 border-green-400' :
            'bg-yellow-500/30 border-2 border-yellow-400 animate-pulse'
          }`}>
            {status}
          </div>
        </div>

        <div className="text-center mb-8">
          <button
            onMouseDown={startTalking}
            onMouseUp={stopTalking}
            onMouseLeave={stopTalking}
            onTouchStart={startTalking}
            onTouchEnd={stopTalking}
            className={`w-40 h-40 rounded-full text-white font-bold text-lg transition-all duration-300 select-none ${
              isTalking 
                ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 animate-pulse scale-95 shadow-2xl shadow-yellow-400/50' 
                : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 hover:scale-105 shadow-xl shadow-red-500/30'
            }`}
            style={{ userSelect: 'none' }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {isTalking ? 'Talking...' : 'Hold to Talk'}
          </button>
          
          <div className="mt-6 p-4 bg-white/10 rounded-2xl text-sm">
            <strong>How to use:</strong><br />
            • Hold down the button to talk<br />
            • Release to stop talking<br />
            • Others can hear you in real-time
          </div>
        </div>

        {participants.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Connected Users:</h3>
            <div className="space-y-2">
              {participants.map((participant) => (
                <div key={participant.id} className="flex justify-between items-center p-3 bg-white/10 rounded-xl">
                  <span>{participant.name} {participant.id === socket?.id ? '(You)' : ''}</span>
                  <div className={`w-5 h-5 rounded-full transition-all duration-300 ${
                    participant.isTalking ? 'bg-green-400 animate-pulse' : 'bg-gray-400/30'
                  }`} />
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={leaveRoom}
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 hover:scale-105 shadow-lg"
        >
          Leave Room
        </button>

        <audio ref={audioRef} autoPlay playsInline />
      </div>
    </div>
  );
}