import { EventEmitter } from "events";
import {
  AgentState,
  AgentAction,
  TaskContext,
  ActionStatus,
  AgentMessage,
} from "./ComputerUseTypes";

export interface ContextConfig {
  maxTurns?: number;
  maxRetries?: number;
  timeout?: number;
}

export class ContextManager extends EventEmitter {
  private context: TaskContext;
  private config: Required<ContextConfig>;

  constructor(config?: ContextConfig) {
    super();

    this.config = {
      maxTurns: config?.maxTurns || 50,
      maxRetries: config?.maxRetries || 3,
      timeout: config?.timeout || 5 * 60 * 1000, // 5 minutes
    };

    // Initialize with empty context
    this.context = this.createEmptyContext();
  }
  startTask(goal: string): void {
    if (this.context.state === AgentState.RUNNING) {
      throw new Error("Cannot start a new task while another is running");
    }

    this.context = {
      id: `task-${Date.now()}`,
      userGoal: goal,
      state: AgentState.RUNNING,
      actions: [],
      currentUrl: "",
      startTime: Date.now(),
      conversationHistory: [],
    };

    this.setState(AgentState.RUNNING);
    this.emit("taskStarted", this.getContext());
  }

  completeTask(finalResponse?: string): void {
    if (this.context.state !== AgentState.RUNNING) {
      throw new Error("No running task to complete");
    }

    this.context.endTime = Date.now();
    this.context.finalResponse = finalResponse;
    this.setState(AgentState.COMPLETED);
    this.emit("taskCompleted", this.getContext());
  }

  failTask(error: string): void {
    if (
      this.context.state !== AgentState.RUNNING &&
      this.context.state !== AgentState.PAUSED
    ) {
      throw new Error("No active task to fail");
    }

    this.context.endTime = Date.now();
    this.context.error = error;
    this.setState(AgentState.ERROR);
    this.emit("taskFailed", this.getContext());
  }

  pauseTask(): void {
    if (this.context.state !== AgentState.RUNNING) {
      throw new Error("Can only pause a running task");
    }

    this.setState(AgentState.PAUSED);
    this.emit("taskPaused", this.getContext());
  }

  resumeTask(): void {
    if (this.context.state !== AgentState.PAUSED) {
      throw new Error("Can only resume a paused task");
    }

    this.setState(AgentState.RUNNING);
    this.emit("taskResumed", this.getContext());
  }

  cancelTask(): void {
    if (
      this.context.state !== AgentState.RUNNING &&
      this.context.state !== AgentState.PAUSED
    ) {
      throw new Error("No active task to cancel");
    }

    this.context.endTime = Date.now();
    this.context.error = "Task cancelled by user";
    this.setState(AgentState.IDLE);
    this.emit("taskCancelled", this.getContext());

    // Reset to empty context
    this.context = this.createEmptyContext();
  }

  reset(): void {
    this.context = this.createEmptyContext();
    this.setState(AgentState.IDLE);
  }

  getState(): AgentState {
    return this.context.state;
  }

  private setState(state: AgentState): void {
    const oldState = this.context.state;
    this.context.state = state;

    if (oldState !== state) {
      this.emit("stateChange", state, oldState);
    }
  }

  getGoal(): string {
    return this.context.userGoal;
  }

  getActionHistory(): AgentAction[] {
    return [...this.context.actions];
  }

  getCurrentTurn(): number {
    return (
      this.context.actions.filter((a) => a.status === ActionStatus.SUCCESS)
        .length + 1
    );
  }

  getCurrentUrl(): string {
    return this.context.currentUrl;
  }

  setCurrentUrl(url: string): void {
    this.context.currentUrl = url;
  }

  addAction(action: AgentAction): void {
    this.context.actions.push(action);
    this.emit("actionAdded", action);
  }

  updateLastAction(updates: Partial<AgentAction>): void {
    if (this.context.actions.length === 0) {
      throw new Error("No actions to update");
    }

    const lastAction = this.context.actions[this.context.actions.length - 1];
    Object.assign(lastAction, updates);

    this.emit("actionUpdated", lastAction);
  }

  getLastAction(): AgentAction | null {
    if (this.context.actions.length === 0) {
      return null;
    }
    return this.context.actions[this.context.actions.length - 1];
  }

  markLastActionSuccess(result?: any): void {
    this.updateLastAction({
      status: ActionStatus.SUCCESS,
      result,
    });
  }

  markLastActionFailed(error: string): void {
    this.updateLastAction({
      status: ActionStatus.FAILED,
      error,
    });
  }

  addToConversationHistory(message: AgentMessage): void {
    this.context.conversationHistory.push(message);
  }

  getConversationHistory(): AgentMessage[] {
    return [...this.context.conversationHistory];
  }

  recordError(error: string): void {
    if (!this.context.error) {
      this.context.error = error;
    } else {
      this.context.error += "\n" + error;
    }
  }

  getErrors(): string[] {
    if (!this.context.error) {
      return [];
    }
    return this.context.error.split("\n");
  }

  canRetry(): boolean {
    const failedActions = this.context.actions.filter(
      (a) => a.status === ActionStatus.FAILED
    );
    return failedActions.length < this.config.maxRetries;
  }

  hasReachedMaxTurns(): boolean {
    return this.getCurrentTurn() > this.config.maxTurns;
  }

  hasTimedOut(): boolean {
    if (!this.context.startTime) {
      return false;
    }

    const elapsed = Date.now() - this.context.startTime;
    return elapsed > this.config.timeout;
  }

  shouldContinue(): boolean {
    if (this.context.state !== AgentState.RUNNING) {
      return false;
    }

    if (this.hasReachedMaxTurns()) {
      return false;
    }

    if (this.hasTimedOut()) {
      return false;
    }

    return true;
  }

  getContext(): Readonly<TaskContext> {
    return { ...this.context };
  }

  isRunning(): boolean {
    return this.context.state === AgentState.RUNNING;
  }

  isPaused(): boolean {
    return this.context.state === AgentState.PAUSED;
  }

  isCompleted(): boolean {
    return this.context.state === AgentState.COMPLETED;
  }

  hasError(): boolean {
    return this.context.state === AgentState.ERROR;
  }

  isIdle(): boolean {
    return this.context.state === AgentState.IDLE;
  }

  getDuration(): number {
    if (!this.context.startTime) {
      return 0;
    }

    const endTime = this.context.endTime || Date.now();
    return endTime - this.context.startTime;
  }

  getConfig(): Readonly<Required<ContextConfig>> {
    return { ...this.config };
  }

  private createEmptyContext(): TaskContext {
    return {
      id: "",
      userGoal: "",
      state: AgentState.IDLE,
      actions: [],
      currentUrl: "",
      startTime: 0,
      conversationHistory: [],
    };
  }
}
