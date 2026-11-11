#!/usr/bin/env python3
"""Check local HTML links without making network requests or changing files."""
import argparse
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote,urlparse

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.references=[]
        self.ids=set()
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if 'id' in attrs:self.ids.add(attrs['id'])
        for key in ['href','src']:
            if key in attrs:self.references.append(attrs[key])

def check(root):
    root=root.resolve()
    pages={file:Page(file.read_text(encoding='utf-8')) for file in root.rglob('*.html') if '.git' not in file.parts}
    problems=[]
    count=0
    for file,page in pages.items():
        for raw in page.references:
            url=urlparse(raw)
            if url.scheme or url.netloc:continue
            count+=1
            if url.path.startswith('/'):
                target=(root/unquote(url.path).lstrip('/')).resolve()
            else:target=(file.parent/unquote(url.path)).resolve() if url.path else file
            if not target.is_relative_to(root):
                problems.append(f'{file.relative_to(root)}: {raw} points outside the project')
                continue
            if target.is_dir():target=target/'index.html'
            if not target.is_file():
                problems.append(f'{file.relative_to(root)}: missing file {raw}')
                continue
            if url.fragment and target.suffix=='.html':
                destination=pages.get(target) or Page(target.read_text(encoding='utf-8'))
                if unquote(url.fragment) not in destination.ids:
                    problems.append(f'{file.relative_to(root)}: missing section {raw}')
    return count,len(pages),problems

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    args=parser.parse_args()
    if not args.root.is_dir():parser.error('The site folder does not exist.')
    links,pages,problems=check(args.root)
    if problems:
        print('\n'.join(problems))
        print(f'FAILED: {len(problems)} broken references.')
        return 1
    print(f'OK: {links} local links across {pages} pages. No files were changed.')
    return 0
if __name__=='__main__':raise SystemExit(main())
