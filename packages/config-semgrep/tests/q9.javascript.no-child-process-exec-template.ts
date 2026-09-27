declare const value: string;

import { exec } from "child_process";
import * as child_process from "node:child_process";

// ruleid: q9.javascript.no-child-process-exec-template
child_process.exec(`echo ${value}`);

// ruleid: q9.javascript.no-child-process-exec-template
exec(`echo ${value}`);

function databaseExec(command: string): void {
  void command;
}

// ok: q9.javascript.no-child-process-exec-template
databaseExec(`echo ${value}`);
