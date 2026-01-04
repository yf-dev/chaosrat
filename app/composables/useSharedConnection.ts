import { ref, watch, onBeforeUnmount } from "vue";
import { useEventListener, useTimeoutPoll } from "@vueuse/core";

interface Data<T> {
  type: "data";
  from: string;
  data: T;
}

interface Heartbeat {
  type: "heartbeat";
  from: string;
}

interface Ping {
  type: "ping";
  from: string;
}

interface Pong {
  type: "pong";
  from: string;
}

type Message<T> = Data<T> | Heartbeat | Ping | Pong;

export interface SharedConnectionOptions<T> {
  /**
   * Callback when a new data is received
   * @param data The data received
   */
  onData: (data: T) => void;

  /**
   * Callback when this client becomes a leader
   * This callback is called when this client becomes a leader
   */
  onBecomeLeader?: () => void;

  /**
   * Callback when this client loses the leader status
   * This callback is called when this client loses the leader status
   */
  onLoseLeader?: () => void;
}

export function useSharedConnection<T>(
  channelName: MaybeRefOrGetter<string | undefined>,
  options: SharedConnectionOptions<T>
) {
  const channelNameRef = toRef(channelName);
  const { onData, onBecomeLeader, onLoseLeader } = options;

  // State
  const channel = ref<BroadcastChannel | undefined>(undefined);
  const uuid = ref<string>(crypto.randomUUID());
  const isLeader = ref(false);
  const isClosed = ref(false);
  const lastHeartbeat = ref<number | null>(null);
  let electionTimer: ReturnType<typeof setTimeout> | null = null;

  // Constants
  const heartbeatInterval = 2000;
  const electionTimeout = 3000 + Math.random() * 1000; // 3000ms ~ 4000ms
  const pingTimeout = 500; // 500ms for fast leader detection

  // Timer management
  function clearElectionTimer() {
    if (electionTimer) {
      clearTimeout(electionTimer);
      electionTimer = null;
    }
  }

  function startElectionTimer() {
    clearElectionTimer();
    electionTimer = setTimeout(checkLeader, electionTimeout);
  }

  // Leader election
  function shouldElectLeader() {
    if (lastHeartbeat.value === null) return true;
    return Date.now() - lastHeartbeat.value > electionTimeout;
  }

  function becomeLeader() {
    if (isLeader.value) return;
    console.log("Becoming leader");
    isLeader.value = true;
    sendHeartbeat();
    onBecomeLeader?.();
  }

  function loseLeader() {
    if (!isLeader.value) return;
    console.log("Losing leader");
    isLeader.value = false;
    lastHeartbeat.value = null;
    startElectionTimer();
    onLoseLeader?.();
  }

  function checkLeader() {
    if (isClosed.value || !channel.value) return;
    console.log("Checking leader");
    if (shouldElectLeader()) {
      becomeLeader();
    }
  }

  // Reset state when channel changes
  function resetState() {
    if (isLeader.value) {
      loseLeader();
    }
    clearElectionTimer();
    lastHeartbeat.value = null;
    isClosed.value = false;
  }

  // Message handling
  function handleChannelMessage(msg: Message<T>) {
    if (!msg || isClosed.value) return;

    switch (msg.type) {
      case "heartbeat":
        console.log("heartbeat", msg);
        if (!isLeader.value) {
          lastHeartbeat.value = Date.now();
          startElectionTimer();
        } else if (msg.from < uuid.value) {
          // Other leader has smaller UUID, yield leadership
          loseLeader();
        }
        break;
      case "ping":
        console.log("ping received", msg);
        // Only leader responds to ping
        if (isLeader.value) {
          sendPong();
        }
        break;
      case "pong":
        console.log("pong received", msg);
        // Leader exists, update heartbeat and reset election timer
        if (!isLeader.value) {
          lastHeartbeat.value = Date.now();
          startElectionTimer();
        }
        break;
      case "data":
        console.log("data", msg);
        onData(msg.data);
        break;
    }
  }

  // Channel management
  const post = (data: Message<T>) => {
    if (channel.value && !isClosed.value) {
      channel.value.postMessage(data);
    }
  };

  const close = () => {
    if (channel.value) {
      channel.value.close();
      channel.value = undefined;
    }
    clearElectionTimer();
    isClosed.value = true;
  };

  function sendHeartbeat() {
    console.log("sendHeartbeat");
    post({ type: "heartbeat", from: uuid.value });
  }

  function sendPing() {
    console.log("sendPing");
    post({ type: "ping", from: uuid.value });
  }

  function sendPong() {
    console.log("sendPong");
    post({ type: "pong", from: uuid.value });
  }

  /**
   * Check if a leader exists by sending a ping and waiting for pong
   * @returns Promise that resolves to true if leader exists, false otherwise
   */
  function checkLeaderExists(): Promise<boolean> {
    return new Promise((resolve) => {
      if (isClosed.value || !channel.value) {
        resolve(false);
        return;
      }

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, pingTimeout);

      const handlePong = (e: MessageEvent) => {
        const msg = e.data as Message<T>;
        if (msg.type === "pong" && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(true);
        }
      };

      channel.value.addEventListener("message", handlePong);

      // Clean up listener after timeout
      setTimeout(() => {
        channel.value?.removeEventListener("message", handlePong);
      }, pingTimeout + 100);

      sendPing();
    });
  }

  /**
   * Fast leader election using ping/pong mechanism
   * If no leader responds within pingTimeout, become leader immediately
   */
  async function fastElection() {
    if (isClosed.value || !channel.value) return;

    const leaderExists = await checkLeaderExists();
    if (!leaderExists && !isLeader.value) {
      console.log("No leader found via ping, becoming leader");
      becomeLeader();
    }
  }

  function sendData(data: T) {
    console.log("sendData", data);
    post({ type: "data", from: uuid.value, data });
    onData(data);
  }

  // Heartbeat interval
  const { pause: pauseHeartbeatInterval } = useTimeoutPoll(
    () => {
      if (isLeader.value && !isClosed.value) {
        sendHeartbeat();
      }
    },
    heartbeatInterval,
    { immediate: true }
  );

  // Watch channel name changes
  watch(
    () => channelNameRef.value,
    (newChannelName) => {
      // Close previous channel
      if (channel.value) {
        channel.value.close();
        channel.value = undefined;
      }

      // Open new channel
      if (newChannelName) {
        console.log("Creating channel", newChannelName);
        resetState();
        channel.value = new BroadcastChannel(newChannelName);

        useEventListener(
          channel,
          "message",
          (e: MessageEvent) => handleChannelMessage(e.data as Message<T>),
          { passive: true }
        );

        useEventListener(
          channel,
          "close",
          () => {
            isClosed.value = true;
          },
          { passive: true }
        );

        // Fast leader detection on channel creation
        fastElection();
      }
    },
    { immediate: true }
  );

  // Cleanup
  onBeforeUnmount(() => {
    close();
    pauseHeartbeatInterval();
  });

  return { isLeader, isClosed, sendData, close };
}
