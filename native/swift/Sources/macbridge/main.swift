import Darwin
import MacBridgeCore

if shouldOpenAppLauncher(arguments: CommandLine.arguments) {
    exit(runAppLauncher())
}

exit(runCLI(CommandLine.arguments))
