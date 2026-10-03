import ExtractPanel from "./ExtractPanel";
import MigratePanel from "./MigratePanel";

// Composes the two independent panels for /migration/json — Section 1
// (ExtractPanel) pulls legacy data out for download, Section 2
// (MigratePanel) uploads a JSON file and imports it. They share no state;
// see each file's own header comment for what it owns.
export default function ImportWorkspace() {
  return (
    <div className="flex flex-col gap-6">
      <ExtractPanel />
      <MigratePanel />
    </div>
  );
}
