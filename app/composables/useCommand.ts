export interface CommandOptions {
  onClear?: () => void;
}

export function useCommand(options: CommandOptions) {
  const commandPrefix = "!!";

  const router = useRouter();

  function executeClear() {
    options.onClear?.();
  }
  function executeSet(variable: string, value: string) {
    const currentQuery = router.currentRoute.value.query;
    if (currentQuery[variable] === undefined) {
      router.replace({
        query: {
          ...currentQuery,
          [variable]: value,
        },
      });
    } else {
      const newQuery = { ...currentQuery };
      newQuery[variable] = value;
      router.replace({
        query: newQuery,
      });
    }
  }

  function executeCommand(command: string, args: string[]): boolean {
    console.log("executeCommand", command, args);
    switch (command) {
      case "clear":
      case "클리어":
        executeClear();
        return true;
      case "set":
      case "설정":
        if (args.length !== 2) {
          console.log("Invalid number of arguments for set command");
          return true;
        }
        const [variable, value] = args;
        executeSet(variable, value);
        return true;
      default:
        console.log("Unknown command:", command);
    }
    return false;
  }

  function onBroadcasterMessage(message: string): boolean {
    if (message.startsWith(commandPrefix)) {
      const [command, ...args] = message.slice(commandPrefix.length).split(" ");
      return executeCommand(command, args);
    }
    return false;
  }
  return { onBroadcasterMessage };
}
