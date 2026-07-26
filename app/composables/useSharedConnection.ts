import {
  ref,
  shallowRef,
  watch,
  toRef,
  onScopeDispose,
  type MaybeRefOrGetter,
} from "vue";
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

  /**
   * Test-only override forwarded to the underlying `BroadcastChannel`
   * constructor (e.g. "simulate" to keep tabs talking in-process).
   * Defaults to the library's auto-detected method.
   */
  type?: string;

  /**
   * Test-only overrides for leader election timing, merged over the
   * defaults (`fallbackInterval: 2000`, `responseTime: 1000`).
   */
  electionOptions?: {
    fallbackInterval?: number;
    responseTime?: number;
  };
}

export function useSharedConnection<T>(
  channelName: MaybeRefOrGetter<string | undefined>,
  options: SharedConnectionOptions<T>
) {
  const channelNameRef = toRef(channelName);
  const { onData, onBecomeLeader, onLoseLeader, type, electionOptions } =
    options;

  // State
  // shallowRef (not ref): `channel`/`elector` must keep their exact object
  // identity rather than being wrapped in a Vue reactive Proxy. Wrapping
  // them breaks identity checks both here (the `elector.value !== thisElector`
  // staleness guard below) and inside `broadcast-channel` itself (e.g. the
  // "simulate" transport excludes the sender from a broadcast by comparing
  // object identity, which a Proxy-wrapped state object would never match).
  const channel = shallowRef<BroadcastChannel<T> | undefined>(undefined);
  const elector = shallowRef<LeaderElector | undefined>(undefined);
  const isLeader = ref(false);
  const isClosed = ref(false);

  // Single teardown path: notify leadership loss (at most once per
  // leadership term) before the elector/channel are actually torn down, then
  // clean up. Used by the channel-name watcher, close(), and scope disposal.
  async function cleanup() {
    if (isLeader.value) {
      isLeader.value = false;
      onLoseLeader?.();
    }
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
      // Close previous channel and elector (fires onLoseLeader if this tab
      // currently holds leadership, before the old channel is torn down)
      await cleanup();

      // Reset state
      isClosed.value = false;

      // Open new channel
      if (newChannelName) {
        console.log("Creating channel", newChannelName);

        // Create broadcast channel
        channel.value = new BroadcastChannel<T>(newChannelName, {
          type: type as any,
        });

        // Set up message handler
        channel.value.onmessage = (msg: T) => {
          console.log("data", msg);
          onData(msg);
        };

        // Create leader elector
        const thisElector = createLeaderElection(channel.value, {
          fallbackInterval: electionOptions?.fallbackInterval ?? 2000, // How often renegotiation for leader occur
          responseTime: electionOptions?.responseTime ?? 1000, // How long instances have to respond
        });
        elector.value = thisElector;

        // Handle duplicate leaders
        thisElector.onduplicate = () => {
          console.warn("Duplicate leaders detected!");
        };

        // Wait for leadership. Guard against this resolving (or rejecting)
        // after this tab has already been torn down -- e.g. the channel
        // name changed, close() was called, or the scope was disposed --
        // in which case `elector.value` no longer points at `thisElector`,
        // or `thisElector` has been marked dead by die().
        thisElector
          .awaitLeadership()
          .then(() => {
            if (elector.value !== thisElector || thisElector.isDead) {
              return;
            }
            console.log("Becoming leader");
            isLeader.value = true;
            onBecomeLeader?.();
          })
          .catch(() => {
            // awaitLeadership() can reject (e.g. the WebLock-based elector
            // aborts its pending lock request when die() is called before
            // leadership was won). Nothing to do in that case.
          });

        // Note: broadcast-channel doesn't have a built-in callback for losing leadership
        // Leadership is typically lost when the tab/process closes
        // If we need to handle explicit leadership loss, we can use elector.die()
      }
    },
    { immediate: true }
  );

  // Cleanup on scope disposal. onScopeDispose works both for a component's
  // unmount and for a plain effectScope (as used in tests), unlike
  // onBeforeUnmount which requires a component instance.
  onScopeDispose(() => {
    void close();
  });

  return { isLeader, isClosed, sendData, close };
}
