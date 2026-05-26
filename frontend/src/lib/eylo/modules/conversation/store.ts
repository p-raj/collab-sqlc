import { BaseReactiveStore } from "../../base/BaseReactiveStore";
import { RepositoryMixin } from "../../base/RepositoryMixin";
import type { EyloStore } from "../../store";

import type { Conversation } from "./model";
import { MessageStore } from "../message/store";

export type ConversationStoreState = {
  conversations: Array<Conversation>;
};

// Apply the mixin
const ConversationStoreBase = RepositoryMixin<
  Conversation,
  ConversationStoreState,
  "conversations"
>("conversations")(BaseReactiveStore<ConversationStoreState>);

class ConversationStore extends ConversationStoreBase {
  // TODO: implement singleton pattern for all stores
  private static _instance: ConversationStore | null = null;
  // @ts-ignore
  private _parent: EyloStore;
  // @ts-ignore
  private _messageStore: MessageStore;
  constructor(parent: EyloStore) {
    if (ConversationStore._instance) {
      return ConversationStore._instance;
    }
    const initialState: ConversationStoreState = {
      conversations: [],
    };
    super(initialState, "eylo:conversation:");
    this._parent = parent;
    this._messageStore = new MessageStore(this._parent);
    ConversationStore._instance = this;
  }
  get messageStore(): MessageStore {
    return this._messageStore;
  }
}

export { ConversationStore };
