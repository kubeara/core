import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import * as pty from "node-pty";
import type { IPty } from "node-pty";
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MIN_TERMINAL_ROWS,
  TERMINAL_TERM_TYPE,
} from "@shared/common";
import {
  TERMINAL_ENV,
  TERMINAL_SHELL,
} from "../common/constants/terminal.constant";

export type TerminalOutputHandler = (sessionId: string, data: string) => void;

export type TerminalCloseHandler = (sessionId: string) => void;

interface TerminalSession {
  sessionId: string;
  pty: IPty;
}

@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);
  private readonly sessions = new Map<string, TerminalSession>();
  private outputHandler: TerminalOutputHandler | null = null;
  private closeHandler: TerminalCloseHandler | null = null;

  /**
   * Sets the output handler for the terminal service.
   */
  setOutputHandler(handler: TerminalOutputHandler): void {
    try {
      this.outputHandler = handler;
    } catch (error) {
      this.logger.error(
        `Failed to set terminal output handler: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Sets the close handler for the terminal service.
   */
  setCloseHandler(handler: TerminalCloseHandler): void {
    try {
      this.closeHandler = handler;
    } catch (error) {
      this.logger.error(
        `Failed to set terminal close handler: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Creates a new terminal session.
   */
  createSession(
    cols: number = DEFAULT_TERMINAL_COLS,
    rows: number = DEFAULT_TERMINAL_ROWS,
  ): string {
    try {
      const sessionId = randomUUID();
      const shell = TERMINAL_SHELL;

      const ptyProcess = pty.spawn(shell, [], {
        name: TERMINAL_TERM_TYPE,
        cols: this.normalizeCols(cols),
        rows: this.normalizeRows(rows),
        cwd: process.env.HOME ?? process.cwd(),
        env: TERMINAL_ENV,
      });

      ptyProcess.onData((data: string) => {
        this.outputHandler?.(sessionId, data);
      });

      ptyProcess.onExit(() => {
        this.logger.log(`Terminal session exited sessionId=${sessionId}`);
        this.sessions.delete(sessionId);
        this.closeHandler?.(sessionId);
      });

      this.sessions.set(sessionId, { sessionId, pty: ptyProcess });
      this.logger.log(
        `Terminal session created sessionId=${sessionId} shell=${shell} cols=${cols} rows=${rows}`,
      );

      return sessionId;
    } catch (error) {
      this.logger.error(
        `Failed to create terminal session: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Writes input to a terminal session.
   */
  writeInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(
        `Ignoring terminal input for unknown sessionId=${sessionId}`,
      );
      return;
    }

    try {
      session.pty.write(data);
    } catch (error) {
      this.logger.warn(
        `Write failed sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resizes a terminal session.
   */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      session.pty.resize(this.normalizeCols(cols), this.normalizeRows(rows));
    } catch (error) {
      this.logger.warn(
        `Failed to resize terminal sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Closes a terminal session.
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.sessions.delete(sessionId);
    try {
      session.pty.kill();
    } catch (error) {
      this.logger.warn(
        `Failed to kill terminal sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.logger.log(`Terminal session closed sessionId=${sessionId}`);
  }

  /**
   * Checks if a terminal session exists.
   */
  hasSession(sessionId: string): boolean {
    try {
      return this.sessions.has(sessionId);
    } catch (error) {
      this.logger.error(
        `Failed to check terminal session sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private normalizeCols(cols: number): number {
    return Math.min(
      MAX_TERMINAL_COLS,
      Math.max(MIN_TERMINAL_COLS, Math.floor(cols) || DEFAULT_TERMINAL_COLS),
    );
  }

  private normalizeRows(rows: number): number {
    return Math.min(
      MAX_TERMINAL_ROWS,
      Math.max(MIN_TERMINAL_ROWS, Math.floor(rows) || DEFAULT_TERMINAL_ROWS),
    );
  }
}
