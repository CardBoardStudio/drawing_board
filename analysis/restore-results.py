"""Restore and verify the compressed historical simulation outputs."""
from pathlib import Path
import gzip,hashlib,json
root=Path(__file__).resolve().parent
for entry in json.loads((root/'raw-results.json').read_text()):
    target=root/entry['file']
    data=gzip.decompress(Path(str(target)+'.gz').read_bytes())
    assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256'],entry['file']
    if target.exists():
        assert target.read_bytes()==data,'Existing output differs: '+entry['file']
    else:
        target.write_bytes(data)
print('All historical simulation outputs restored and checksum-verified.')
