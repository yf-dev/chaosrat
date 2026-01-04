import { ref, watch, onBeforeUnmount } from "vue";
import {
  BroadcastChannel,
  createLeaderElection,
  type LeaderElector,
} from "broadcast-channel";

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
  const channel = ref<BroadcastChannel<T> | undefined>(undefined);
  const elector = ref<LeaderElector | undefined>(undefined);
  const isLeader = ref(false);
  const isClosed = ref(false);

  // Cleanup current channel and elector
  async function cleanup() {
    if (elector.value) {
      await elector.value.die();
      elector.value = undefined;
    }
    if (channel.value) {
      await channel.value.close();
      channel.value = undefined;
    }
  }

  // Close function for external use
  const close = async () => {
    await cleanup();
    isClosed.value = true;
  };

  // Send data to all tabs
  function sendData(data: T) {
    console.log("sendData", data);
    if (channel.value && !isClosed.value) {
      channel.value.postMessage(data);
    }
    // Also handle locally
    onData(data);
  }

  // Watch channel name changes
  watch(
    () => channelNameRef.value,
    async (newChannelName) => {
      // Close previous channel and elector
      await cleanup();

      // Reset state
      isClosed.value = false;
      isLeader.value = false;

      // Open new channel
      if (newChannelName) {
        console.log("Creating channel", newChannelName);

        // Create broadcast channel
        channel.value = new BroadcastChannel<T>(newChannelName);

        // Set up message handler
        channel.value.onmessage = (msg: T) => {
          console.log("data", msg);
          onData(msg);
        };

        // Create leader elector
        elector.value = createLeaderElection(channel.value, {
          fallbackInterval: 2000, // How often renegotiation for leader occur
          responseTime: 1000, // How long instances have to respond
        });

        // Handle duplicate leaders
        elector.value.onduplicate = () => {
          console.warn("Duplicate leaders detected!");
        };

        // Wait for leadership
        elector.value.awaitLeadership().then(() => {
          console.log("Becoming leader");
          isLeader.value = true;
          onBecomeLeader?.();
        });

        // Note: broadcast-channel doesn't have a built-in callback for losing leadership
        // Leadership is typically lost when the tab/process closes
        // If we need to handle explicit leadership loss, we can use elector.die()
      }
    },
    { immediate: true }
  );

  // Cleanup on unmount
  onBeforeUnmount(async () => {
    if (isLeader.value) {
      onLoseLeader?.();
    }
    await close();
  });

  return { isLeader, isClosed, sendData, close };
}
