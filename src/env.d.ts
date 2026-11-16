/// <reference types="@astrojs/cloudflare/types" />

declare namespace App {
  interface Locals {
    /** Current workspace, from the `ws` cookie (see src/middleware.ts). */
    workspace: import('./lib/db/workspaces').Workspace;
    workspaces: import('./lib/db/workspaces').Workspace[];
  }
}
