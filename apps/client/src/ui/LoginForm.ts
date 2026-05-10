import { DEFAULT_ROOM_ID } from "../assets";

type LoginValues = {
  username: string;
  roomId: string;
};

export class LoginForm {
  readonly element = document.createElement("section");

  private readonly username = document.createElement("input");
  private readonly roomId = document.createElement("input");

  constructor(private readonly onSubmit: (values: LoginValues) => void) {
    this.element.className = "login-panel";
    this.element.innerHTML = "";

    const title = document.createElement("h1");
    title.textContent = "Join a room";

    const intro = document.createElement("p");
    intro.textContent = "Pick a temporary name and enter the shared lobby.";

    const form = document.createElement("form");
    form.append(this.createField("Username", this.username), this.createField("Room", this.roomId));

    const button = document.createElement("button");
    button.className = "primary-button";
    button.type = "submit";
    button.textContent = "Join";
    form.append(button);

    this.username.maxLength = 24;
    this.username.required = true;
    this.username.autocomplete = "off";
    this.username.placeholder = "dan";

    this.roomId.maxLength = 64;
    this.roomId.required = true;
    this.roomId.value = DEFAULT_ROOM_ID;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = this.username.value.trim();
      const roomId = this.roomId.value.trim();

      if (!username || !roomId) {
        return;
      }

      this.onSubmit({ username, roomId });
    });

    this.element.append(title, intro, form);
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  private createField(labelText: string, input: HTMLInputElement): HTMLLabelElement {
    const label = document.createElement("label");
    const labelContent = document.createElement("span");
    label.className = "field";
    labelContent.textContent = labelText;
    label.append(labelContent, input);
    return label;
  }
}
