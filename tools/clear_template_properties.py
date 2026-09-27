"""Clear the file properties of ACR_EMPLOYEE_MASTER.docx that named the people who edited the filled ACR the master
was made from (author, last modified by) and its old title. Every generated ACR copies these properties.
Refuses to run if they are already blank.
"""
from pathlib import Path
from docx import Document

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'


def main():
    doc = Document(MASTER)
    props = doc.core_properties
    if not (props.author or props.last_modified_by or props.title):
        raise SystemExit('File properties are already blank. Nothing changed.')
    props.author = ''
    props.last_modified_by = ''
    props.title = ''
    doc.save(MASTER)
    print('Cleared author, last modified by and title of the template.')


if __name__ == '__main__':
    main()
