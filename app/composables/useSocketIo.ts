import io from "socket.io-client";

export type SocketStatus = "OPEN" | "CONNECTING" | "CLOSED";

export interface SocketIoOptions {
  onConnected?: () => void;
  onDisconnected?: () => void;

  events?: Record<string, (...args: any[]) => void>;

  /**
   * Immediately open the connection when calling this composable
   *
   * @default true
   */
  immediate?: boolean;

  socketOptions?: SocketIOClient.ConnectOpts;
}

export function useSocketIo(
  url: MaybeRefOrGetter<string | undefined>,
  options: SocketIoOptions = {}
) {
  const {
    onConnected,
    onDisconnected,
    events,
    immediate = true,
    socketOptions,
  } = options;
  const status = ref<SocketStatus>("CLOSED");
  const urlRef = toRef(url);
  const socketRef = ref<SocketIOClient.Socket | undefined>();

  const _init = () => {
    if (typeof urlRef.value === "undefined") return;
    const socket = io.connect(urlRef.value, socketOptions);
    socketRef.value = socket;
    status.value = "CONNECTING";
    socket.on("connect", () => {
      status.value = "OPEN";
      onConnected?.();
    });
    socket.on("disconnect", () => {
      status.value = "CLOSED";
      onDisconnected?.();
    });
    if (events) {
      for (const [event, handler] of Object.entries(events)) {
        socket.on(event, handler);
      }
    }
  };

  const close = () => {
    if (socketRef.value) {
      socketRef.value.close();
      socketRef.value = undefined;
    }
  };

  const open = () => {
    close();
    _init();
  };

  if (immediate) open();

  return {
    status,
    close,
    open,
    socket: socketRef,
  };
}
