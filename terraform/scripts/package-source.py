"""Package only runtime source; credentials and Terraform state never enter releases."""
import argparse
from pathlib import Path
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
excluded = {"node_modules", "node_modules.nosync", "dist", ".git", ".terraform", ".local", "__pycache__"}
files = [root / name for name in ("docker-compose.yml", "terraform/compose.production.yml", "terraform/Caddyfile", "terraform/scripts/verify-host.sh")]
for directory in ("Maple-Sugar-BE", "Maple-Sugar-FE"):
    for path in (root / directory).rglob("*"):
        relative = path.relative_to(root)
        if not path.is_file() or path.is_symlink() or any(part in excluded for part in relative.parts):
            continue
        if path.name.startswith((".env", "client_secret")) or path.name == "vercel.json" or path.suffix in {".dump", ".tfstate", ".tfplan"}:
            continue
        files.append(path)
args.output.parent.mkdir(parents=True, exist_ok=True)
with tarfile.open(args.output, "w:gz") as archive:
    for path in sorted(files):
        archive.add(path, arcname=path.relative_to(root).as_posix(), recursive=False)
print(f"Packaged {len(files)} source files")
