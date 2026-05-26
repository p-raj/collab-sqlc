import { EventEmitter } from "../events";
import { AgentService } from "../modules/agent";
import { ContactService } from "../modules/contact";
import type { TContact, TContactCreate } from "../modules/contact/types";
import { ConversationService, type TConversationCreate } from "../modules/conversation";
import { MessageService } from "../modules/message/service";
import type { TMessageCreate, TWidgetResponseMessageCreate } from "../modules/message/types";
import { ParticipantService } from "../modules/participant/service";
import { EyloStore } from "../store";

class Eylo {
  private static _instance: Eylo | null = null;
  // @ts-ignore || __init__ will set these
  private _ee: EventEmitter;
  // @ts-ignore || __init__ will set these
  private _store: EyloStore;
  private _contact!: TContact | TContactCreate;
  // @ts-ignore || __init__ will set these
  private _contactService: ContactService;
  // @ts-ignore || __init__ will set these
  private _conversationService: ConversationService;
  // @ts-ignore || __init__ will set these
  private _messageService: MessageService;
  // @ts-ignore || __init__ will set these
  private _participantService: ParticipantService;
  // @ts-ignore || __init__ will set these
  private _agentService: AgentService;

  constructor(organizationId: string, contactDetails: TContactCreate) {
    if (Eylo._instance) {
      return Eylo._instance;
    }

    this._contact = contactDetails;
    this.__init__(organizationId);
    Eylo._instance = this;
  }

  private __init__ = (organizationId: string): void => {
    this._ee = new EventEmitter();
    this._store = new EyloStore(organizationId, this._ee);
    this._contactService = new ContactService(this._store);
    this._conversationService = new ConversationService(this._store);
    this._messageService = new MessageService(this._store);
    this._participantService = new ParticipantService(this._store);
    this._agentService = new AgentService(this._store);
  };

  get ee(): EventEmitter {
    return this._ee;
  }
  get store(): EyloStore {
    return this._store;
  }
  get contact(): TContact | TContactCreate | undefined {
    return this._contact;
  }
  get contactService(): ContactService {
    return this._contactService;
  }
  get conversationService(): ConversationService {
    return this._conversationService;
  }
  get messageService(): MessageService {
    return this._messageService;
  }
  get participantService(): ParticipantService {
    return this._participantService;
  }
  get agentService(): AgentService {
    return this._agentService;
  }

  public initialize = async (): Promise<void> => {
    this._store.cm.connect(this._contact as TContactCreate);
  };
  public terminate = () => {
    this._store.cm.disconnect();
    // Clear all singleton instances so a fresh Eylo can be created on next login
    Eylo._resetSingletons();
  };

  /** Reset all module singletons so re-initialization starts clean. */
  private static _resetSingletons = (): void => {
    Eylo._instance = null;
    // Services and stores use static _instance — clear them via prototype access
    // This is necessary because the singleton pattern returns cached instances
    (AgentService as unknown as { _instance: unknown })._instance = undefined;
    (ContactService as unknown as { _instance: unknown })._instance = undefined;
    (ConversationService as unknown as { _instance: unknown })._instance = undefined;
    (MessageService as unknown as { _instance: unknown })._instance = undefined;
    (ParticipantService as unknown as { _instance: unknown })._instance = undefined;
  };
  public startConversation = (
    conversationRequest: TConversationCreate,
    requestId: string
  ): void => {
    this._conversationService.startConversation(conversationRequest, requestId);
  };
  public sendMessage = (request: TMessageCreate, requestId: string): boolean => {
    return this._messageService.sendMessage(request, requestId);
  };
  public sendWidgetResponse = (
    request: TWidgetResponseMessageCreate,
    requestId: string
  ): boolean => {
    return this._messageService.sendWidgetResponse(request, requestId);
  };
  public sendFeedback = (requestId: string, feedback: "positive" | "negative"): boolean => {
    return this._messageService.sendFeedback(requestId, feedback);
  };
}

export { Eylo };
