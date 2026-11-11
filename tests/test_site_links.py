from pathlib import Path
import subprocess,sys,tempfile,unittest
CHECK=Path(__file__).resolve().parents[1]/'tools/check_site.py'
class SiteLinkChecks(unittest.TestCase):
 def run_site(self,markup):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder);(p/'index.html').write_text(markup)
   return subprocess.run([sys.executable,str(CHECK),'--root',str(p)],capture_output=True,text=True)
 def test_flags_missing_local_file(self):
  r=self.run_site('<a href="missing.html">Lost</a>');self.assertEqual(r.returncode,1);self.assertIn('missing.html',r.stdout)
 def test_flags_missing_local_fragment(self):
  r=self.run_site('<a href="#missing">Lost</a>');self.assertEqual(r.returncode,1);self.assertIn('#missing',r.stdout)
 def test_accepts_existing_anchor_and_ignores_external_services(self):
  r=self.run_site('<a href="#ok">Here</a><h1 id="ok">OK</h1><a href="https://example.com/">External</a>');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
 def test_rejects_links_outside_project(self):
  r=self.run_site('<a href="../private.txt">Outside</a>');self.assertEqual(r.returncode,1);self.assertIn('outside',r.stdout.lower())
if __name__=='__main__':unittest.main()
