import { BaseReactiveStore } from "../base/BaseReactiveStore";
import { EventEmitter } from "../events";
import { AgentStore } from "../modules/agent/store";
import { ContactStore } from "../modules/contact";
import { ConversationStore } from "../modules/conversation";
import { ParticipantStore } from "../modules/participant/store";
import { ConnectionStore } from "../net";

export type TEyloAppState = {
  organizationId: string;
  contactStore?: ContactStore;
  conversationStore?: ConversationStore;
  connectionManager?: ConnectionStore;
  participantStore?: ParticipantStore;
  agentStore?: AgentStore;
  ee: EventEmitter;
};

class EyloStore extends BaseReactiveStore<TEyloAppState> {
  constructor(organizationId: string, eventEmitter: EventEmitter) {
    const initialState = {
      organizationId,
      ee: eventEmitter,
    };
    super(initialState);
    this.__init__();
  }

  private __init__ = (): void => {
    const contactStore = new ContactStore(this);
    const connectionManager = new ConnectionStore(this);
    const conversationStore = new ConversationStore(this);
    const participantStore = new ParticipantStore(this);
    const agentStore = new AgentStore(this);
    this.set("conversationStore", conversationStore);
    this.set("contactStore", contactStore);
    this.set("connectionManager", connectionManager);
    this.set("participantStore", participantStore);
    this.set("agentStore", agentStore);
  };

  get cm(): ConnectionStore {
    return this.get("connectionManager")!;
  }

  get ee(): EventEmitter {
    return this.get("ee");
  }

  get contactStore(): ContactStore {
    return this.get("contactStore")!;
  }

  get conversationStore(): ConversationStore {
    return this.get("conversationStore")!;
  }

  get participantStore(): ParticipantStore {
    return this.get("participantStore")!;
  }

  get organizationId(): string {
    return this.get("organizationId");
  }

  get agentStore(): AgentStore {
    return this.get("agentStore")!;
  }

  get sessionId(): string | null {
    return this.cm.get("sessionId");
  }

  get connectionStateManager() {
    return this.cm.connectionStateManager;
  }

  get store(): TEyloAppState {
    return this.state;
  }
}

export { EyloStore };
