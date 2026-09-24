/**
 * Jira MCP Server - Attachment Tools
 *
 * Tools for uploading local files as Jira issue attachments.
 */

import { readFile, stat } from "node:fs/promises";
import { isAbsolute, basename } from "node:path";
import { lookup } from "mime-types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jiraPostForm } from "../client.js";
import { formatResponse } from "../config.js";
import { startToolCall, endToolCall, failToolCall } from "../logger.js";
import type { JiraAttachment } from "../types.js";

/**
 * Upload a local file as an attachment to a Jira issue.
 */
export const uploadAttachment = async (
  issueKey: string,
  filePath: string,
): Promise<JiraAttachment[]> => {
  if (!isAbsolute(filePath)) {
    throw new Error(
      "filePath must be an absolute path on the MCP server host.",
    );
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Unable to access attachment file "${filePath}": ${message}`,
    );
  }

  if (!fileStats.isFile()) {
    throw new Error(`Attachment path is not a regular file: "${filePath}"`);
  }

  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Unable to read attachment file "${filePath}": ${message}`);
  }

  const filename = basename(filePath);
  const mimeType = lookup(filename) || "application/octet-stream";
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(content)], { type: mimeType }),
    filename,
  );

  return jiraPostForm<JiraAttachment[]>(
    `/issue/${encodeURIComponent(issueKey)}/attachments`,
    formData,
  );
};

/**
 * Register attachment tools with the MCP server.
 */
export const registerAttachmentTools = (server: McpServer): void => {
  server.tool(
    "jira_upload_attachment",
    "Upload a local file as an attachment to an existing Jira issue. Use jira_create_issue first when creating a new issue, then provide its returned issue key. The filePath must be an absolute path readable by the MCP server host. Any file type is supported; Jira determines the final file size and permission limits.",
    {
      issueKey: z
        .string()
        .min(1)
        .describe("Issue key (e.g., KP-123) or numeric issue ID"),
      filePath: z
        .string()
        .min(1)
        .describe("Absolute path to the local file on the MCP server host"),
    },
    async (args) => {
      const callLog = startToolCall("jira_upload_attachment", args);
      try {
        const attachments = await uploadAttachment(
          args.issueKey,
          args.filePath,
        );
        endToolCall(callLog, attachments);
        return {
          content: [{ type: "text", text: formatResponse(attachments) }],
        };
      } catch (err) {
        failToolCall(callLog, err);
        throw err;
      }
    },
  );
};
