#!/usr/bin/env python3
"""Run the website's dependency-free maintenance checks."""
from pathlib import Path
import subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
for command in [
    ['node','--test','tests/site-behavior.test.cjs'],
    [sys.executable,'-m','unittest','discover','-s','tests','-p','test_*.py'],
    [sys.executable,'tools/check_site.py'],
]:
    result=subprocess.run(command,cwd=ROOT)
    if result.returncode:raise SystemExit(result.returncode)
print('PASS: website behavior and local links checked. No build or install needed.')
