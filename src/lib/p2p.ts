import { Peer, DataConnection } from 'peerjs';
import { RoomState, DeviceInfo, TrackMeta } from '../types';

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  timestamp: number;
}

export interface RoomMember {
  userId: string;
  name: string;
  pfpUrl: string;
  joinedAt: number;
}



class P2PRoomManager {
  public code: string = '';
  public deviceId: string = '';
  public deviceName: string = '';
  public isHost: boolean = false;
  
  public peer: Peer | null = null;
  public hostConnection: DataConnection | null = null;
  public connections: Record<string, DataConnection> = {}; // key: guest deviceId, val: DataConnection
  
  public roomState: RoomState | null = null;
  public chatMessages: ChatMessage[] = [];
  public lastScrubTime: number = 0;
  
  public roomListeners: Set<(state: RoomState) => void> = new Set();
  public presenceListeners: Set<(members: RoomMember[]) => void> = new Set();
  public messageListeners: Set<(msgs: ChatMessage[]) => void> = new Set();
  
  constructor() {
    // Phase 2, Requirement 9: Timeline state broadcast loop every 1 second
    setInterval(() => {
      if (this.isHost && this.roomState && Object.keys(this.connections).length > 0) {
        // Timeline state broadcast
        const audio = document.querySelector('audio');
        if (audio) {
          let currentTime = audio.currentTime;
          let isPlaying = !audio.paused;

          const track = this.roomState.currentTrack;
          const isYoutube = !!(track?.id?.startsWith("yt_") || 
                              (track?.streamUrl && (track.streamUrl.includes("id=") || track.streamUrl.includes("/api/stream?id="))));

          if (isYoutube) {
            const yt = (window as any).activeYtPlayer;
            if (yt && typeof yt.getCurrentTime === 'function' && typeof yt.getPlayerState === 'function') {
              try {
                currentTime = yt.getCurrentTime() || 0;
                const state = yt.getPlayerState();
                isPlaying = (state === 1); // 1 is Playing
              } catch (e) {
                console.warn("[P2P Sync] Host failed getting YT player states:", e);
              }
            }
          }

          this.broadcast({
            type: 'HOST_TIMELINE_SYNC',
            currentTrackId: this.roomState.currentTrack?.id || '',
            isPlaying: isPlaying,
            playbackTimestamp: currentTime
          });
        }

        // Cleanup inactive users (30 seconds)
        const now = Date.now();
        let changed = false;
        Object.keys(this.roomState.devices).forEach(dId => {
          if (dId === this.deviceId) return;
          const device = this.roomState!.devices[dId];
          if (now - device.lastActive > 30000) {
            console.log(`[P2P Host] Removing inactive user ${dId}`);
            if (this.connections[dId]) {
              this.connections[dId].close();
              delete this.connections[dId];
            }
            delete this.roomState!.devices[dId];
            changed = true;
          }
        });
        if (changed) {
          this.broadcast({ type: 'SYNC_STATE', roomState: this.roomState, chatMessages: this.chatMessages });
          this.notifyRoomListeners();
          this.notifyPresenceListeners();
        }
      }
    }, 1000);
  }

  public generateRoomCode(): string {
    const code = Math.floor(100000 + Math.random() * 900000);
    return code.toString();
  }

  public async createRoom(code: string, hostId: string, hostName: string, audioSource: string): Promise<RoomState> {
    this.code = code;
    this.deviceId = hostId;
    this.deviceName = hostName;
    this.isHost = true;
    this.connections = {};
    
    const initialRoom: RoomState = {
      code,
      isPlaying: false,
      audioSource,
      startTime: Date.now(),
      pauseOffset: 0,
      hostId,
      playbackPermission: 'everyone',
      devices: {
        [hostId]: {
          id: hostId,
          name: hostName,
          isHost: true,
          ping: 0,
          offset: 0,
          x: 50,
          y: 50,
          volume: 1.0,
          lastActive: Date.now()
        }
      },
      queue: [],
      history: []
    };
    
    this.roomState = initialRoom;

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
    
    this.peer = new Peer(code);
    
    this.peer.on('open', () => {
      console.log(`[P2P Host] Opened room ${code} successfully over matchmaking broker.`);
    });
    
    this.peer.on('error', (err) => {
      console.error('[P2P Host] Matchmaker broker error:', err);
    });

    this.peer.on('connection', (conn) => {
      console.log(`[P2P Host] Incoming connection from peer...`);
      conn.on('data', (data: any) => {
        this.handleMessageFromGuest(conn, data);
      });

      conn.on('close', () => {
        const dId = Object.keys(this.connections).find(k => this.connections[k] === conn);
        if (dId) {
          console.log(`[P2P Host] Peer guest disconnected: ${dId}`);
          delete this.connections[dId];
          if (this.roomState) {
            delete this.roomState.devices[dId];
            this.broadcast({
              type: 'SYNC_STATE',
              roomState: this.roomState,
              chatMessages: this.chatMessages
            });
            this.notifyRoomListeners();
            this.notifyPresenceListeners();
          }
        }
      });
    });

    return this.roomState;
  }

  public async joinRoom(code: string, deviceId: string, deviceName: string, isHost = false): Promise<RoomState> {
    this.code = code;
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.isHost = false;
    
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    this.peer = new Peer();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connecting to P2P host room timed out. Please verify that the host is active and your session code is correct."));
      }, 10000);

      this.peer!.on('open', () => {
        console.log(`[P2P Guest] Client peer opened. Connecting to: ${code}`);
        const conn = this.peer!.connect(code);
        this.hostConnection = conn;

        conn.on('open', () => {
          clearTimeout(timeout);
          console.log(`[P2P Guest] Signal handshake complete. Joining room...`);
          conn.send({
            type: 'JOIN',
            deviceId,
            deviceName
          });
        });

        conn.on('data', (data: any) => {
          this.handleMessageFromHost(data);
          if (data && data.type === 'SYNC_STATE' && this.roomState) {
            resolve(this.roomState);
          }
        });

        conn.on('close', () => {
          console.warn('[P2P Guest] Lost connection to Host...');
          this.hostConnection = null;
          this.handleHostDisconnection();
        });

        conn.on('error', (err) => {
          console.error('[P2P Guest] Data channel connection error:', err);
          reject(err);
        });
      });

      this.peer!.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[P2P Guest] Matchmaker broker handshake failure:', err);
        reject(err);
      });
    });
  }

  private async handleHostDisconnection() {
    if (!this.roomState) return;
    console.log('[P2P Guest] Attempting to auto-recover room...');
    
    // Wait random time to avoid collision
    await new Promise(resolve => setTimeout(resolve, Math.random() * 3000));
    
    try {
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
      }
      this.peer = new Peer(this.code);
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 6000);
        this.peer!.on('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        this.peer!.on('error', (err: any) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      this.isHost = true;
      this.roomState.hostId = this.deviceId;
      Object.keys(this.roomState.devices).forEach(id => {
        this.roomState!.devices[id].isHost = (id === this.deviceId);
      });
      this.connections = {};
      
      this.peer.on('connection', (conn) => {
        console.log(`[P2P Host (Recovered)] Incoming connection from peer...`);
        conn.on('data', (data: any) => {
          this.handleMessageFromGuest(conn, data);
        });
        conn.on('close', () => {
          const dId = Object.keys(this.connections).find(k => this.connections[k] === conn);
          if (dId) {
            delete this.connections[dId];
            if (this.roomState) {
              delete this.roomState.devices[dId];
              this.broadcast({ type: 'SYNC_STATE', roomState: this.roomState, chatMessages: this.chatMessages });
              this.notifyRoomListeners();
              this.notifyPresenceListeners();
            }
          }
        });
      });
      
      console.log('[P2P Host] Successfully recovered and became the new host!');
      this.notifyRoomListeners();
      this.notifyPresenceListeners();
      
    } catch (err) {
      console.log('[P2P Guest] Someone else became host. Rejoining...', err);
      // Fallback to retry joining
      setTimeout(() => {
        this.joinRoom(this.code, this.deviceId, this.deviceName).catch(e => console.error("Rejoin failed", e));
      }, 2000);
    }
  }

  private handleMessageFromGuest(conn: DataConnection, data: any) {
    if (!data || !this.roomState) return;

    switch (data.type) {
      case 'JOIN': {
        const { deviceId, deviceName } = data;
        this.connections[deviceId] = conn;

        this.roomState.devices[deviceId] = {
          id: deviceId,
          name: deviceName,
          isHost: false,
          ping: 25,
          offset: 0,
          x: Math.round(30 + Math.random() * 40),
          y: Math.round(30 + Math.random() * 40),
          volume: 1.0,
          lastActive: Date.now()
        };

        // Send confirmation back immediately
        conn.send({
          type: 'SYNC_STATE',
          roomState: this.roomState,
          chatMessages: this.chatMessages
        });

        // Broadcast to all other connections
        this.broadcast({
          type: 'SYNC_STATE',
          roomState: this.roomState,
          chatMessages: this.chatMessages
        });

        this.notifyRoomListeners();
        this.notifyPresenceListeners();
        break;
      }
      case 'UPDATE_DEVICE': {
        const { deviceId, fields } = data;
        if (this.roomState.devices[deviceId]) {
          this.roomState.devices[deviceId] = {
            ...this.roomState.devices[deviceId],
            ...fields,
            lastActive: Date.now()
          };
          this.broadcast({
            type: 'SYNC_STATE',
            roomState: this.roomState,
            chatMessages: this.chatMessages
          });
          this.notifyRoomListeners();
          this.notifyPresenceListeners();
        }
        break;
      }
      case 'UPDATE_PLAYER': {
        const senderId = Object.keys(this.connections).find(k => this.connections[k] === conn);
        const isLogicalHost = senderId === this.roomState.hostId;
        const canControl = this.roomState.playbackPermission === 'everyone' || isLogicalHost;
        if (canControl) {
          const { isPlaying, startTime, pauseOffset, audioSource, currentTrack, queue, history, spatialSetupActive } = data;
          
          this.roomState.isPlaying = isPlaying;
          this.roomState.startTime = startTime;
          this.roomState.pauseOffset = pauseOffset;
          if (audioSource !== undefined) this.roomState.audioSource = audioSource;
          if (currentTrack !== undefined) this.roomState.currentTrack = currentTrack;
          if (queue !== undefined) this.roomState.queue = queue;
          if (history !== undefined) this.roomState.history = history;
          if (spatialSetupActive !== undefined && isLogicalHost) this.roomState.spatialSetupActive = spatialSetupActive;

          const audio = document.querySelector('audio');
          if (audio) {
            if (audioSource !== undefined) {
              const currentAbsolute = audio.src;
              const expectedAbsolute = audioSource.startsWith('http://') || audioSource.startsWith('https://')
                ? audioSource
                : new URL(audioSource, window.location.origin).href;
              if (currentAbsolute !== expectedAbsolute) {
                audio.src = audioSource;
              }
            }
            if (isPlaying && audio.paused) {
              audio.play()
                .then(() => { console.log("Playback started successfully on mobile device."); })
                .catch((error) => { 
                   console.error("Playback failed, attempting asset reload: ", error);
                   audio.load();
                   setTimeout(() => { audio.play().catch(e => console.log("Final playback fallback blocked:", e)); }, 300);
                });
            } else if (!isPlaying && !audio.paused) {
              audio.pause();
            }
            if (pauseOffset !== undefined && Math.abs(audio.currentTime - (pauseOffset / 1000)) > 1.5) {
              try {
                if (audio.readyState >= 1) {
                  audio.currentTime = pauseOffset / 1000;
                }
              } catch (e) {}
            }
          }

          this.broadcast({
            type: 'SYNC_STATE',
            roomState: this.roomState,
            chatMessages: this.chatMessages
          });
          this.notifyRoomListeners();
        }
        break;
      }
      case 'ADD_QUEUE': {
        const senderId = Object.keys(this.connections).find(k => this.connections[k] === conn);
        const isLogicalHost = senderId === this.roomState.hostId;
        const canControl = this.roomState.playbackPermission === 'everyone' || isLogicalHost;
        if (canControl) {
          const { track } = data;
          this.roomState.queue = [...(this.roomState.queue || []), track];
          this.broadcast({
            type: 'SYNC_STATE',
            roomState: this.roomState,
            chatMessages: this.chatMessages
          });
          this.notifyRoomListeners();
        }
        break;
      }
      case 'REMOVE_QUEUE': {
        const senderId = Object.keys(this.connections).find(k => this.connections[k] === conn);
        const isLogicalHost = senderId === this.roomState.hostId;
        const canControl = this.roomState.playbackPermission === 'everyone' || isLogicalHost;
        if (canControl) {
          const { track } = data;
          this.roomState.queue = (this.roomState.queue || []).filter(t => t.id !== track.id);
          this.broadcast({
            type: 'SYNC_STATE',
            roomState: this.roomState,
            chatMessages: this.chatMessages
          });
          this.notifyRoomListeners();
        }
        break;
      }
      case 'SEND_CHAT_MSG': {
        const { msg } = data;
        this.chatMessages = [...this.chatMessages, msg];
        this.broadcast({
          type: 'CHAT_MSG',
          msg
        });
        this.notifyMessageListeners();
        break;
      }
      case 'TRANSFER_HOST': {
        const senderId = Object.keys(this.connections).find(k => this.connections[k] === conn);
        if (senderId === this.roomState.hostId) {
          const { newHostId } = data;
          this.roomState.hostId = newHostId;
          Object.keys(this.roomState.devices).forEach(id => {
            this.roomState!.devices[id].isHost = (id === newHostId);
          });
          this.broadcast({ type: 'SYNC_STATE', roomState: this.roomState, chatMessages: this.chatMessages });
          this.notifyRoomListeners();
          this.notifyPresenceListeners();
        }
        break;
      }
      case 'KICK_USER': {
        const senderId = Object.keys(this.connections).find(k => this.connections[k] === conn);
        if (senderId === this.roomState.hostId) {
          const { targetId } = data;
          if (this.connections[targetId]) {
            this.connections[targetId].send({ type: 'KICKED' });
            setTimeout(() => {
              if (this.connections[targetId]) {
                this.connections[targetId].close();
                delete this.connections[targetId];
              }
            }, 500);
            delete this.roomState.devices[targetId];
            this.broadcast({ type: 'SYNC_STATE', roomState: this.roomState, chatMessages: this.chatMessages });
            this.notifyRoomListeners();
            this.notifyPresenceListeners();
          }
        }
        break;
      }
    }
  }

  public async convertToHost() {
    if (!this.roomState) return;
    console.log('[P2P Guest] Active promotion/handover: transitioning to Host...');
    
    this.isHost = true;
    
    if (this.hostConnection) {
      try { this.hostConnection.close(); } catch (e) {}
      this.hostConnection = null;
    }

    try {
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
      }
      
      this.peer = new Peer(this.code);
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 5000);
        this.peer!.on('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        this.peer!.on('error', (err: any) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      this.connections = {};
      
      this.peer.on('connection', (conn) => {
        console.log(`[P2P Host (Promoted)] Incoming connection from peer...`);
        conn.on('data', (data: any) => {
          this.handleMessageFromGuest(conn, data);
        });
        conn.on('close', () => {
          const dId = Object.keys(this.connections).find(k => this.connections[k] === conn);
          if (dId) {
            delete this.connections[dId];
            if (this.roomState) {
              delete this.roomState.devices[dId];
              this.broadcast({ type: 'SYNC_STATE', roomState: this.roomState, chatMessages: this.chatMessages });
              this.notifyRoomListeners();
              this.notifyPresenceListeners();
            }
          }
        });
      });

      console.log('[P2P Host] Device successfully converted to active Host!');
      this.notifyRoomListeners();
      this.notifyPresenceListeners();

    } catch (err) {
      console.error('[P2P Guest] Handover peer initialization failed:', err);
      this.isHost = false;
      setTimeout(() => {
        this.joinRoom(this.code, this.deviceId, this.deviceName).catch(e => console.error("Rejoin failed", e));
      }, 1000);
    }
  }

  public relinquishHostRole(newHostId: string) {
    if (!this.isHost || !this.roomState) return;
    console.log(`[P2P Host] Relinquishing host role and transferring keys to: ${newHostId}...`);
    
    this.isHost = false;

    // Terminate all socket descriptors as host
    Object.keys(this.connections).forEach(id => {
      try { this.connections[id].close(); } catch (e) {}
    });
    this.connections = {};

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }

    // Schedule rejoining as a normal listener to the newly promoted host after 1 second
    const targetCode = this.code;
    setTimeout(() => {
      console.log('[P2P Client] Registering back with new host as a guest client...');
      this.joinRoom(targetCode, this.deviceId, this.deviceName).catch(err => {
        console.error('[P2P Handover] Failed to register as listener:', err);
      });
    }, 1000);
  }

  private handleMessageFromHost(data: any) {
    if (!data) return;

    switch (data.type) {
      case 'SYNC_STATE': {
        const wasHost = this.isHost;
        // If we recently scrubbed locally, ignore timeline-related updates from host
        if (Date.now() - this.lastScrubTime < 2500) {
           const { isPlaying, audioSource, currentTrack, queue, history, playbackPermission, devices } = data.roomState;
           if (this.roomState) {                
             this.roomState = { ...this.roomState, isPlaying, audioSource, currentTrack, queue, history, playbackPermission, devices };
           }
        } else {
           this.roomState = data.roomState;
        }

        // Handover Promotion Check
        if (this.roomState && this.roomState.hostId === this.deviceId && !wasHost) {
          console.log('[P2P Guest] Received promotion signal. Transitioning ownership...');
          this.convertToHost();
        }

        this.chatMessages = data.chatMessages;
        this.notifyRoomListeners();
        this.notifyPresenceListeners();
        this.notifyMessageListeners();
        break;
      }
      case 'CHAT_MSG': {
        this.chatMessages = [...this.chatMessages, data.msg];
        this.notifyMessageListeners();
        break;
      }
      case 'HOST_TIMELINE_SYNC': {
        // Guest: Ignore host syncs for 5 seconds after a local scrub to prevent jumpy playback
        if (Date.now() - this.lastScrubTime < 5000) break;
        
        const track = this.roomState?.currentTrack;
        // Verify we are synchronized on the same track as the host before updating playhead position
        if (track && data.currentTrackId && track.id !== data.currentTrackId) {
          console.warn("[P2P Sync] Track ID mismatch between guest and host, deferring timeline sync");
          break;
        }

        const isYoutube = !!(track?.id?.startsWith("yt_") || 
                          (track?.streamUrl && (track.streamUrl.includes("id=") || track.streamUrl.includes("/api/stream?id="))));

        const { isPlaying, playbackTimestamp } = data;

        if (isYoutube) {
          const yt = (window as any).activeYtPlayer;
          if (yt && typeof yt.getCurrentTime === 'function') {
            try {
              // Sync play/pause state
              const state = yt.getPlayerState?.() ?? -1;
              if (isPlaying && state !== 1) {
                yt.playVideo();
              } else if (!isPlaying && state === 1) {
                yt.pauseVideo();
              }

              // Sync seek / drift
              const guestTime = yt.getCurrentTime() || 0;
              const hostTime = playbackTimestamp;
              const drift = Math.abs(hostTime - guestTime);
              if (drift > 1.5) {
                yt.seekTo(hostTime, true);
              }
            } catch (err) {
              console.warn("[P2P Sync] YT guest sync err:", err);
            }
          }
        } else {
          const audio = document.querySelector('audio');
          if (audio) {
            if (isPlaying && audio.paused) {
              audio.play()
                .then(() => { console.log("Playback started successfully."); })
                .catch((error) => { 
                   console.error("Playback failed: ", error);
                   audio.load();
                   setTimeout(() => { audio.play().catch(e => console.log("Final playback fallback blocked:", e)); }, 300);
                });
            } else if (!isPlaying && !audio.paused) {
              audio.pause();
            }

            const guestTime = audio.currentTime;
            const hostTime = playbackTimestamp;
            const drift = Math.abs(hostTime - guestTime);

            if (drift > 1.5) {
              try {
                if (audio.readyState >= 1) {
                  audio.currentTime = hostTime;
                }
              } catch (e) {
                console.warn("[P2P Sync] Failed setting audio.currentTime, loading metadata:", e);
              }
            }
          }
        }
        break;
      }
      case 'KICKED': {
        console.warn('You have been kicked by the host.');
        if (this.peer) this.peer.destroy();
        this.hostConnection = null;
        this.roomState = null;
        window.location.reload();
        break;
      }
    }
  }

  public broadcast(payload: any) {
    Object.values(this.connections).forEach((conn) => {
      if (conn.open) {
        conn.send(payload);
      }
    });
  }

  public notifyRoomListeners() {
    if (this.roomState) {
      this.roomListeners.forEach(cb => cb({ ...this.roomState! }));
    }
  }

  public notifyPresenceListeners() {
    if (this.roomState) {
      const devices = this.roomState.devices || {};
      const members: RoomMember[] = Object.values(devices).map((d: any) => ({
        userId: d.id,
        name: d.name || 'Anonymous',
        pfpUrl: `https://api.dicebear.com/8.x/micah/svg?seed=${d.id}&backgroundColor=transparent`,
        joinedAt: d.lastActive || Date.now()
      }));
      this.presenceListeners.forEach(cb => cb(members.sort((a, b) => a.joinedAt - b.joinedAt)));
    }
  }

  public notifyMessageListeners() {
    this.messageListeners.forEach(cb => cb([...this.chatMessages]));
  }
}

export const p2pRoomManager = new P2PRoomManager();

export async function createRoom(
  code: string, 
  hostId: string, 
  hostName: string,
  audioSource: string
): Promise<RoomState> {
  return p2pRoomManager.createRoom(code, hostId, hostName, audioSource);
}

export async function joinRoom(
  code: string, 
  deviceId: string, 
  deviceName: string,
  isHost = false
): Promise<RoomState> {
  return p2pRoomManager.joinRoom(code, deviceId, deviceName, isHost);
}

export async function updateDeviceState(
  code: string,
  deviceId: string,
  deviceFields: Partial<DeviceInfo>
): Promise<void> {
  if (p2pRoomManager.isHost) {
    if (p2pRoomManager.roomState && p2pRoomManager.roomState.devices[deviceId]) {
      p2pRoomManager.roomState.devices[deviceId] = {
        ...p2pRoomManager.roomState.devices[deviceId],
        ...deviceFields,
        lastActive: Date.now()
      };
      p2pRoomManager.broadcast({
        type: 'SYNC_STATE',
        roomState: p2pRoomManager.roomState,
        chatMessages: p2pRoomManager.chatMessages
      });
      p2pRoomManager.notifyRoomListeners();
      p2pRoomManager.notifyPresenceListeners();
    }
  } else {
    p2pRoomManager.hostConnection?.send({
      type: 'UPDATE_DEVICE',
      deviceId,
      fields: deviceFields
    });
  }
}

export async function updateRoomPlayerState(
  code: string,
  isPlaying: boolean,
  startTime: number,
  pauseOffset: number,
  audioSource?: string,
  currentTrack?: TrackMeta,
  queue?: TrackMeta[],
  history?: TrackMeta[],
  spatialSetupActive?: boolean
): Promise<void> {
  if (p2pRoomManager.isHost) {
    if (p2pRoomManager.roomState) {
      p2pRoomManager.roomState.isPlaying = isPlaying;
      p2pRoomManager.roomState.startTime = startTime;
      p2pRoomManager.roomState.pauseOffset = pauseOffset;
      if (audioSource !== undefined) p2pRoomManager.roomState.audioSource = audioSource;
      if (currentTrack !== undefined) p2pRoomManager.roomState.currentTrack = currentTrack;
      if (queue !== undefined) p2pRoomManager.roomState.queue = queue;
      if (history !== undefined) p2pRoomManager.roomState.history = history;
      if (spatialSetupActive !== undefined) p2pRoomManager.roomState.spatialSetupActive = spatialSetupActive;

      const audio = document.querySelector('audio');
      if (audio) {
        if (audioSource !== undefined) {
          const currentAbsolute = audio.src;
          const expectedAbsolute = audioSource.startsWith('http://') || audioSource.startsWith('https://')
            ? audioSource
            : new URL(audioSource, window.location.origin).href;
          if (currentAbsolute !== expectedAbsolute) {
            audio.src = audioSource;
          }
        }
        if (isPlaying && audio.paused) {
          audio.play()
            .then(() => { console.log("Playback started successfully on mobile device."); })
            .catch((error) => { 
               console.error("Playback failed, attempting asset reload: ", error);
               audio.load();
               setTimeout(() => { audio.play().catch(e => console.log("Final playback fallback blocked:", e)); }, 300);
            });
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
        if (pauseOffset !== undefined && Math.abs(audio.currentTime - (pauseOffset / 1000)) > 1.5) {
          audio.currentTime = pauseOffset / 1000;
        }
      }

      p2pRoomManager.broadcast({
        type: 'SYNC_STATE',
        roomState: p2pRoomManager.roomState,
        chatMessages: p2pRoomManager.chatMessages
      });
      p2pRoomManager.notifyRoomListeners();
    }
  } else {
    p2pRoomManager.hostConnection?.send({
      type: 'UPDATE_PLAYER',
      isPlaying,
      startTime,
      pauseOffset,
      audioSource,
      currentTrack,
      queue,
      history
    });
  }
}

export function joinRoomPresence(roomId: string, userId: string, nickname: string) {
  // Joined automatically during room instantiation/joins
}

export function leaveRoomPresence(roomId: string, userId: string) {
  if (p2pRoomManager.peer) {
    try { p2pRoomManager.peer.destroy(); } catch (e) {}
    p2pRoomManager.peer = null;
    p2pRoomManager.hostConnection = null;
    p2pRoomManager.connections = {};
  }
}

export function subscribeToPresence(roomId: string, onUpdate: (members: RoomMember[]) => void) {
  p2pRoomManager.presenceListeners.add(onUpdate);
  p2pRoomManager.notifyPresenceListeners();
  return () => {
    p2pRoomManager.presenceListeners.delete(onUpdate);
  };
}

export async function addTrackToQueue(code: string, track: TrackMeta) {
  if (p2pRoomManager.isHost) {
    if (p2pRoomManager.roomState) {
      p2pRoomManager.roomState.queue = [...(p2pRoomManager.roomState.queue || []), track];
      p2pRoomManager.broadcast({
        type: 'SYNC_STATE',
        roomState: p2pRoomManager.roomState,
        chatMessages: p2pRoomManager.chatMessages
      });
      p2pRoomManager.notifyRoomListeners();
    }
  } else {
    p2pRoomManager.hostConnection?.send({
      type: 'ADD_QUEUE',
      track
    });
  }
}

export async function removeTrackFromQueue(code: string, track: TrackMeta) {
  if (p2pRoomManager.isHost) {
    if (p2pRoomManager.roomState) {
      p2pRoomManager.roomState.queue = (p2pRoomManager.roomState.queue || []).filter(t => t.id !== track.id);
      p2pRoomManager.broadcast({
        type: 'SYNC_STATE',
        roomState: p2pRoomManager.roomState,
        chatMessages: p2pRoomManager.chatMessages
      });
      p2pRoomManager.notifyRoomListeners();
    }
  } else {
    p2pRoomManager.hostConnection?.send({
      type: 'REMOVE_QUEUE',
      track
    });
  }
}

export async function sendChatMessage(code: string, text: string, deviceId: string, deviceName: string): Promise<void> {
  const msg: ChatMessage = {
    id: Math.random().toString(36).substring(2, 11),
    userId: deviceId,
    name: deviceName,
    text,
    timestamp: Date.now()
  };

  if (p2pRoomManager.isHost) {
    p2pRoomManager.chatMessages = [...p2pRoomManager.chatMessages, msg];
    p2pRoomManager.broadcast({
      type: 'CHAT_MSG',
      msg
    });
    p2pRoomManager.notifyMessageListeners();
  } else {
    p2pRoomManager.hostConnection?.send({
      type: 'SEND_CHAT_MSG',
      msg
    });
  }
}

export function subscribeToMessages(
  code: string,
  onUpdate: (messages: ChatMessage[]) => void
): () => void {
  p2pRoomManager.messageListeners.add(onUpdate);
  p2pRoomManager.notifyMessageListeners();
  return () => {
    p2pRoomManager.messageListeners.delete(onUpdate);
  };
}

export function generateRoomCode(): string {
  return p2pRoomManager.generateRoomCode();
}

export function subscribeToRoom(
  code: string,
  onUpdate: (state: RoomState) => void,
  onError: (error: Error) => void
): () => void {
  p2pRoomManager.roomListeners.add(onUpdate);
  p2pRoomManager.notifyRoomListeners();
  return () => {
    p2pRoomManager.roomListeners.delete(onUpdate);
  };
}

export async function updateRoomPermissions(code: string, permission: 'everyone' | 'admins'): Promise<void> {
  if (p2pRoomManager.isHost && p2pRoomManager.roomState) {
    p2pRoomManager.roomState.playbackPermission = permission;
    p2pRoomManager.broadcast({
      type: 'SYNC_STATE',
      roomState: p2pRoomManager.roomState,
      chatMessages: p2pRoomManager.chatMessages
    });
    p2pRoomManager.notifyRoomListeners();
  }
}

export async function transferHostPrivilege(code: string, newHostId: string): Promise<void> {
  if (p2pRoomManager.isHost && p2pRoomManager.roomState) {
    p2pRoomManager.roomState.hostId = newHostId;
    Object.keys(p2pRoomManager.roomState.devices).forEach(id => {
      p2pRoomManager.roomState!.devices[id].isHost = (id === newHostId);
    });
    p2pRoomManager.broadcast({ type: 'SYNC_STATE', roomState: p2pRoomManager.roomState, chatMessages: p2pRoomManager.chatMessages });
    p2pRoomManager.notifyRoomListeners();
    p2pRoomManager.notifyPresenceListeners();
    
    // Command relinquishing steps
    p2pRoomManager.relinquishHostRole(newHostId);
  } else {
    p2pRoomManager.hostConnection?.send({
      type: 'TRANSFER_HOST',
      newHostId
    });
  }
}

export async function kickRoomUser(code: string, targetId: string): Promise<void> {
  if (p2pRoomManager.isHost && p2pRoomManager.roomState) {
    if (p2pRoomManager.connections[targetId]) {
      p2pRoomManager.connections[targetId].send({ type: 'KICKED' });
      setTimeout(() => {
        if (p2pRoomManager.connections[targetId]) {
          p2pRoomManager.connections[targetId].close();
          delete p2pRoomManager.connections[targetId];
        }
      }, 500);
      delete p2pRoomManager.roomState.devices[targetId];
      p2pRoomManager.broadcast({ type: 'SYNC_STATE', roomState: p2pRoomManager.roomState, chatMessages: p2pRoomManager.chatMessages });
      p2pRoomManager.notifyRoomListeners();
      p2pRoomManager.notifyPresenceListeners();
    }
  } else {
    p2pRoomManager.hostConnection?.send({
      type: 'KICK_USER',
      targetId
    });
  }
}
