type DisconnectedDialogOptions = {
  onRetry: () => void;
  onReturnToLobby: () => void;
};

export class DisconnectedDialog {
  readonly element = document.createElement("section");

  private readonly title = document.createElement("h2");
  private readonly message = document.createElement("p");
  private readonly countdown = document.createElement("p");
  private readonly retryButton = document.createElement("button");
  private readonly lobbyButton = document.createElement("button");

  constructor(options: DisconnectedDialogOptions) {
    const header = document.createElement("header");
    const actions = document.createElement("div");

    this.element.className = "connection-dialog hidden";
    header.className = "connection-dialog-header";
    this.message.className = "connection-dialog-message";
    this.countdown.className = "connection-dialog-countdown";
    actions.className = "connection-dialog-actions";

    this.retryButton.type = "button";
    this.retryButton.className = "primary-button";
    this.retryButton.textContent = "Retry now";
    this.retryButton.addEventListener("click", () => options.onRetry());

    this.lobbyButton.type = "button";
    this.lobbyButton.className = "secondary-button";
    this.lobbyButton.textContent = "Return to lobby";
    this.lobbyButton.addEventListener("click", () => options.onReturnToLobby());

    header.append(this.title);
    actions.append(this.retryButton, this.lobbyButton);
    this.element.append(header, this.message, this.countdown, actions);
  }

  showDisconnected(message: string, retryInSeconds: number): void {
    this.title.textContent = "Connection paused";
    this.message.textContent = message;
    this.retryButton.disabled = false;
    this.lobbyButton.disabled = false;
    this.setCountdown(retryInSeconds);
    this.element.classList.remove("hidden");
  }

  showRetrying(message: string): void {
    this.title.textContent = "Reconnecting";
    this.message.textContent = message;
    this.countdown.textContent = "Checking the room server...";
    this.retryButton.disabled = true;
    this.lobbyButton.disabled = true;
    this.element.classList.remove("hidden");
  }

  setCountdown(seconds: number): void {
    this.countdown.textContent =
      seconds <= 0 ? "Retrying now..." : `Retrying in ${seconds.toString()}s`;
  }

  hide(): void {
    this.element.classList.add("hidden");
  }
}
