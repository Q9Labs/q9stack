export type RealtimeDataChannelPort = {
  readonly readyState: string;
  send(data: string): void;
  close(): void;
  onOpen(listener: () => void): () => void;
  onMessage(listener: (data: unknown) => void): () => void;
  onError(listener: (cause: unknown) => void): () => void;
  onClose(listener: () => void): () => void;
};

export type RealtimeMediaTrackPort = {
  enabled: boolean;
  stop(): void;
  readonly nativeTrack?: MediaStreamTrack;
};

export type RealtimeMediaStreamPort = {
  getTracks(): readonly RealtimeMediaTrackPort[];
  getAudioTracks(): readonly RealtimeMediaTrackPort[];
  readonly nativeStream?: MediaStream;
};

export type RealtimePeerConnectionPort = {
  createDataChannel(label: string): RealtimeDataChannelPort;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addTrack(track: RealtimeMediaTrackPort, stream: RealtimeMediaStreamPort): void;
  onTrack(listener: (stream: RealtimeMediaStreamPort) => void): () => void;
  close(): void;
};

export type RealtimeAudioElementPort = {
  autoplay: boolean;
  srcObject: RealtimeMediaStreamPort | null;
  play(): Promise<void>;
};

export type RealtimeWebApis = {
  readonly createPeerConnection: () => RealtimePeerConnectionPort;
  readonly getUserMedia: () => Promise<RealtimeMediaStreamPort>;
  readonly createAudioElement: () => RealtimeAudioElementPort;
  readonly fetch: typeof globalThis.fetch;
};

function makeDataChannel(channel: RTCDataChannel): RealtimeDataChannelPort {
  return {
    get readyState() {
      return channel.readyState;
    },
    send(data) {
      channel.send(data);
    },
    close() {
      channel.close();
    },
    onOpen(listener) {
      channel.addEventListener("open", listener);
      return () => channel.removeEventListener("open", listener);
    },
    onMessage(listener) {
      const handler = (event: MessageEvent): void => {
        listener(event.data);
      };
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
    onError(listener) {
      const handler = (event: Event): void => {
        listener(event);
      };
      channel.addEventListener("error", handler);
      return () => channel.removeEventListener("error", handler);
    },
    onClose(listener) {
      channel.addEventListener("close", listener);
      return () => channel.removeEventListener("close", listener);
    },
  };
}

function wrapMediaTrack(track: MediaStreamTrack): RealtimeMediaTrackPort {
  return {
    get enabled() {
      return track.enabled;
    },
    set enabled(value: boolean) {
      track.enabled = value;
    },
    stop() {
      track.stop();
    },
    nativeTrack: track,
  };
}

function wrapMediaStream(stream: MediaStream): RealtimeMediaStreamPort {
  return {
    getTracks() {
      return stream.getTracks().map(wrapMediaTrack);
    },
    getAudioTracks() {
      return stream.getAudioTracks().map(wrapMediaTrack);
    },
    nativeStream: stream,
  };
}

function makePeerConnection(): RealtimePeerConnectionPort {
  const peer = new RTCPeerConnection();
  return {
    createDataChannel(label) {
      return makeDataChannel(peer.createDataChannel(label));
    },
    createOffer() {
      return peer.createOffer();
    },
    setLocalDescription(description) {
      return peer.setLocalDescription(description);
    },
    setRemoteDescription(description) {
      return peer.setRemoteDescription(description);
    },
    addTrack(track, stream) {
      if (track.nativeTrack === undefined || stream.nativeStream === undefined) {
        throw new Error("The default WebRTC adapter requires native media handles");
      }
      peer.addTrack(track.nativeTrack, stream.nativeStream);
    },
    onTrack(listener) {
      const handler = (event: RTCTrackEvent): void => {
        const stream = event.streams[0];
        if (stream !== undefined) {
          listener(wrapMediaStream(stream));
        }
      };
      peer.addEventListener("track", handler);
      return () => peer.removeEventListener("track", handler);
    },
    close() {
      peer.close();
    },
  };
}

export function makeDefaultRealtimeWebApis(): RealtimeWebApis {
  return {
    createPeerConnection: makePeerConnection,
    getUserMedia: async () =>
      wrapMediaStream(await navigator.mediaDevices.getUserMedia({ audio: true })),
    createAudioElement: () => {
      const element = document.createElement("audio");
      let stream: RealtimeMediaStreamPort | null = null;
      return {
        get autoplay() {
          return element.autoplay;
        },
        set autoplay(value: boolean) {
          element.autoplay = value;
        },
        get srcObject() {
          return stream;
        },
        set srcObject(value: RealtimeMediaStreamPort | null) {
          stream = value;
          element.srcObject = value?.nativeStream ?? null;
        },
        play() {
          return element.play();
        },
      };
    },
    fetch: globalThis.fetch,
  };
}
