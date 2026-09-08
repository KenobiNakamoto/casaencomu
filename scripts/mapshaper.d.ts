/** mapshaper ships no types. One command line in, its named output files out. */
declare module "mapshaper" {
  const mapshaper: {
    applyCommands(command: string, input: Record<string, string>): Promise<Record<string, string>>;
  };
  export default mapshaper;
}
