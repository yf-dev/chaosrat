import { ref, watch, onBeforeUnmount } from "vue";
import {
  tryOnScopeDispose,
  useBroadcastChannel,
  useEventListener,
  useTimeoutPoll,
} from "@vueuse/core";
import type { ChatItem } from "~/lib/interfaces";

interface Data<T> {
  type: "data";
  from: string;
  data: T;
}

interface Heartbeat {
  type: "heartbeat";
  from: string;
}

type Message<T> = Data<T> | Heartbeat;

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
  const channel = ref<BroadcastChannel | undefined>(undefined);

  const uuid = ref<string>(crypto.randomUUID());

  const isLeader = ref(false);
  const lastHeartbeat = ref(Date.now());

  const heartbeatInterval = 2000;
  const electionTimeout = 3000 + Math.random() * 1000; // 3000ms ~ 4000ms

  const isClosed = ref(false);

  function handleChannelMessage(msg: Message<T>) {
    if (!msg) return;

    switch (msg.type) {
      case "heartbeat":
        console.log("heartbeat", msg);
        if (!isLeader.value) {
          lastHeartbeat.value = Date.now();
          setTimeout(checkLeader, electionTimeout);
        } else {
          // There are other leaders, so we should stop being a leader if uuid is smaller
          if (msg.from < uuid.value) {
            loseLeader();
          }
        }
        break;
      case "data":
        console.log("data", msg);
        onData(msg.data);
        break;
      default:
        break;
    }
  }

  watch(
    () => ({
      channelName: channelNameRef.value,
    }),
    (val) => {
      if (channel.value) {
        channel.value.close();
      }
      if (val.channelName) {
        console.log("Creating channel", val.channelName);
        channel.value = new BroadcastChannel(val.channelName);
        const listenerOptions = {
          passive: true,
        };

        useEventListener(
          channel,
          "message",
          (e: MessageEvent) => {
            handleChannelMessage(e.data as Message<T>);
          },
          listenerOptions
        );

        useEventListener(
          channel,
          "close",
          () => {
            isClosed.value = true;
          },
          listenerOptions
        );
      }
    },
    { immediate: true }
  );

  const post = (data: Message<T>) => {
    if (channel.value) channel.value.postMessage(data);
  };

  const close = () => {
    if (channel.value) channel.value.close();
    isClosed.value = true;
  };

  function sendHeartbeat() {
    console.log("sendHeartbeat");
    post({ type: "heartbeat", from: uuid.value });
  }

  function sendData(data: T) {
    console.log("sendData", data);
    post({ type: "data", from: uuid.value, data: data });
    onData(data);
  }

  function doHeartbeatInterval() {
    if (isLeader.value) {
      sendHeartbeat();
    }
  }

  const { pause: pauseHeartbeatInterval } = useTimeoutPoll(
    doHeartbeatInterval,
    heartbeatInterval,
    { immediate: true }
  );

  function shouldElectLeader() {
    const now = Date.now();
    return now - lastHeartbeat.value > electionTimeout;
  }

  function becomeLeader() {
    console.log("Becoming leader");
    isLeader.value = true;
    sendHeartbeat();
    if (onBecomeLeader) {
      onBecomeLeader();
    }
  }

  function checkLeader() {
    if (shouldElectLeader()) {
      becomeLeader();
    }
  }

  function loseLeader() {
    isLeader.value = false;
    if (onLoseLeader) {
      onLoseLeader();
    }
  }

  onBeforeUnmount(() => {
    close();
    pauseHeartbeatInterval();
  });

  setTimeout(checkLeader, electionTimeout);

  return { isLeader, sendData };
}
