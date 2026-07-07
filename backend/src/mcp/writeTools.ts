/**
 * Tools on the eea-geonetwork MCP server that mutate the catalogue and are
 * marked "Requires authentication". These are gated behind explicit user
 * confirmation in the chat loop (dev-plan §5.1). Everything not listed here is
 * treated as read-only and runs automatically.
 */
export const WRITE_TOOLS = new Set<string>([
  'update_record',
  'update_record_title',
  'duplicate_record',
  'add_record_tags',
  'delete_record_tags',
  'process_record',
  'delete_attachment',
  'upload_file_to_record',
  'upload_base64_to_record',
  'upload_url_to_record',
  'create_upload_link',
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}
