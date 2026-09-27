from __future__ import annotations
import json, re, shutil, subprocess
from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree
from docx import Document
from docx.shared import RGBColor, Inches, Pt
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH

HERE=Path(__file__).resolve().parent
TEMPLATE=HERE/'ACR_EMPLOYEE_MASTER.docx'
APPENDIX_DIR=HERE/'appendix_pages'
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W='{%s}'%NS['w']
BLUE=RGBColor(0,0,204)


def set_cell(doc,ti,row,col,text):
    cell=doc.tables[ti].cell(row,col)
    if not cell.paragraphs: cell.add_paragraph()
    p=cell.paragraphs[0]
    if not p.runs: r=p.add_run()
    else: r=p.runs[0]
    r.text=str(text or '')
    r.font.color.rgb=BLUE
    for rr in p.runs[1:]: rr.text=''


def clone_row(table,row_idx):
    tr=table.rows[row_idx]._tr
    new_tr=deepcopy(tr)
    tr.addnext(new_tr)
    return table.rows[row_idx+1]


def fill_rows(doc,ti,rows,start=1):
    t=doc.tables[ti]
    existing=max(0,len(t.rows)-start)
    if len(rows)>existing:
        for _ in range(len(rows)-existing): clone_row(t,start)
    for i,row in enumerate(rows):
        vals=row if isinstance(row,list) else [row.get(str(c),'') for c in range(len(t.columns))]
        for c in range(len(t.columns)): set_cell(doc,ti,start+i,c, vals[c] if c<len(vals) else '')


def score_classes(teaching):
    vals=[]
    for x in teaching:
        if x.get('percent') is not None:
            try: vals.append(float(x['percent']))
            except: pass
        else:
            a=x.get('allocated'); d=x.get('delivered')
            try:
                a=float(a); d=float(d); vals.append(100*d/a if a else 0)
            except: pass
    pct=sum(vals)/len(vals) if vals else 0
    return (50*pct/100 if pct>=80 else 0), pct


def api_scores(data):
    api=data.get('api',{}); a=data.get('part2',{})
    teaching=a.get('teaching',[])
    c1_classes,pct=score_classes(teaching)
    extra=float(api.get('extraHours',0) or 0)
    c1_extra=min(10,2*extra)
    compliance=float(api.get('knowledgeCompliance',0) or 0)
    c1_knowledge=min(20,20*compliance/100)
    # Innovative: indicators supplied as point values; total capped at 20.
    innov=float(api.get('innovativePoints',0) or 0); c1_innov=min(20,innov)
    # Examination duty compliance weighted against max 25.
    exam=float(api.get('examPoints',0) or 0); c1_exam=min(25,exam)
    c1=min(125,c1_classes+c1_extra+c1_knowledge+c1_innov+c1_exam)
    # Category II: accept rule-derived raw component scores, cap reportable total at 25.
    c2e=min(20,float(api.get('extensionPoints',0) or 0)); c2m=min(15,float(api.get('managementPoints',0) or 0)); c2p=min(15,float(api.get('professionalPoints',0) or 0))
    c2=min(25,c2e+c2m+c2p)
    c3=float(api.get('category3Total',0) or 0)
    return {'classes':c1_classes,'classPct':pct,'extra':c1_extra,'knowledge':c1_knowledge,'innovative':c1_innov,'exam':c1_exam,'cat1':c1,'c2e':c2e,'c2m':c2m,'c2p':c2p,'cat2':c2,'cat3':c3,'total12':c1+c2}


def replace_tokens(docx_path, out_path, values):
    with ZipFile(docx_path,'r') as zin: files={n:zin.read(n) for n in zin.namelist()}
    root=etree.fromstring(files['word/document.xml'])
    token_map={'{{'+k+'}}':str(v or '') for k,v in values.items()}
    # First pass: replace tokens within individual text nodes, preserving all
    # surrounding tabs, spacing and run structure in the official template.
    replaced=set()
    for tnode in root.xpath('.//w:t',namespaces=NS):
        txt=tnode.text or ''
        newtxt=txt
        for tok,val in token_map.items():
            if tok in newtxt:
                newtxt=newtxt.replace(tok,val); replaced.add(tok)
        if newtxt!=txt: tnode.text=newtxt
    # Second pass: handle any token that happened to be split across XML runs.
    for p in root.xpath('.//w:p',namespaces=NS):
        full=''.join(p.xpath('.//w:t/text()',namespaces=NS))
        if not any(tok in full for tok in token_map):
            continue
        changed=full
        hit=False
        for tok,val in token_map.items():
            if tok in changed:
                changed=changed.replace(tok,val); hit=True
        if not hit: continue
        texts=p.xpath('.//w:t',namespaces=NS)
        if not texts:
            r=etree.SubElement(p,W+'r'); t=etree.SubElement(r,W+'t'); t.text=changed; continue
        texts[0].text=changed
        for tt in texts[1:]: tt.text=''
    files['word/document.xml']=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone='yes')
    with ZipFile(out_path,'w',ZIP_DEFLATED) as zout:
        for n,b in files.items(): zout.writestr(n,b)


def add_page_break_image(doc,path):
    sec=doc.add_section(WD_SECTION.NEW_PAGE)
    sec.page_width=Inches(8.27); sec.page_height=Inches(11.69)
    sec.top_margin=Inches(0); sec.bottom_margin=Inches(0); sec.left_margin=Inches(0); sec.right_margin=Inches(0)
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before=Pt(0); p.paragraph_format.space_after=Pt(0)
    p.add_run().add_picture(str(path),width=Inches(8.27),height=Inches(11.69))


def prepare_appendix_images():
    APPENDIX_DIR.mkdir(exist_ok=True)
    if all((APPENDIX_DIR/f'page-{n}.png').exists() for n in (28,29,30)): return
    src=HERE/'UGC_ACR_Form.pdf'
    out=HERE/'_pdf_render'
    subprocess.run(['python','/home/oai/skills/pdfs/scripts/render_pdf.py',str(src),'--out_dir',str(out),'--dpi','144'],check=True)
    from PIL import Image, ImageDraw, ImageFont
    font_path='/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf'
    font=ImageFont.truetype(font_path,26)
    for n in (28,29,30):
        im=Image.open(out/f'page-{n}.png').convert('RGB')
        w,h=im.size
        # Mask original page number and put sequential ACR page number 28/29/30.
        ImageDraw.Draw(im).rectangle([int(w*0.90),int(h*0.935),w,int(h*0.995)],fill='white')
        d=ImageDraw.Draw(im); txt=str(n); bbox=d.textbbox((0,0),txt,font=font); tw=bbox[2]-bbox[0]; th=bbox[3]-bbox[1]
        d.text((w-int(w*0.07)-tw,h-int(h*0.045)-th),txt,font=font,fill='black')
        im.save(APPENDIX_DIR/f'page-{n}.png')


def generate(data,out_docx):
    prepare_appendix_images()
    doc=Document(TEMPLATE)
    p=data.get('profile',{}); a=data.get('part2',{}); api=data.get('api',{})
    scores=api_scores(data)
    # Profile/certification tokens.
    values={
      'COLLEGE_NAME':data.get('college',{}).get('name',''), 'COLLEGE_DISTRICT_PIN':data.get('college',{}).get('districtPin',''),
      'COLLEGE_PIN':data.get('college',{}).get('pin',''), 'COLLEGE_ADDRESS_SHORT':data.get('college',{}).get('addressShort',''), 'PRINCIPAL_NAME':data.get('college',{}).get('principal',''),
      'FULL_NAME':p.get('fullName',''), 'SESSION':data.get('session',''), 'FATHER_HUSBAND':p.get('fatherHusband',''), 'EMPLOYEE_CODE':p.get('employeeCode',''), 'SUBJECT':p.get('subject',''),
      'APPOINTMENT_DATE':p.get('appointmentDate',''), 'DESIGNATION':p.get('designation',''), 'PAY_INFO':p.get('payInfo',p.get('basicPay','')), 'PROMOTION':p.get('promotion',''),
      'ACADEMIC_QUAL':p.get('academicQualification',''), 'PROFESSIONAL_QUAL':p.get('professionalQualification',''), 'RESEARCH_DEGREE':p.get('researchDegree',''), 'DOB_WORDS':p.get('dobWords',''),
      'SERVICE_STATUS':p.get('serviceStatus',''), 'DEPT_EXAM_ROLL':a.get('departmentalExam',''), 'DEPT_EXAM_SESSION':a.get('departmentalExamSession',''), 'HINDI_DETAILS':re.sub(r'^.*?letter no\.:\s*','',str(a.get('hindiDetails',''))),
      'OTHER_ASSIGNMENT':a.get('otherAssignment',''), 'ADDR1':p.get('addressLine1',''), 'ADDR2':p.get('addressLine2',''), 'ADDR3':p.get('addressLine3',''), 'MOBILE':p.get('mobile',''), 'EMAIL':p.get('email',''),
      'P17':a.get('p17',''), 'P18':a.get('p18',''), 'P19B':a.get('p19b',''), 'P21I':a.get('p21i',''), 'P24A':a.get('p24a',''), 'P24B':a.get('p24b',''), 'P24C':a.get('p24c',''), 'P23':a.get('p23',''), 'OTHER_INFO':a.get('otherInfo',''),
      'REPORT_DATE':data.get('reportDate','')
    }
    # Tables 1/2/3/4
    teaching=[]
    for i,x in enumerate(a.get('teaching',[]),1):
        pct=x.get('percent');
        if pct in (None,''):
            try: pct=f"{100*float(x.get('delivered',0))/float(x.get('allocatedNumeric',x.get('allocated',0))):.0f}%"
            except: pct=x.get('syllabus','')
        else: pct=f'{float(pct):g}%'
        teaching.append([i,x.get('classCourse',x.get('class','')),x.get('college',''),x.get('allocated',''),x.get('delivered',''),pct or x.get('syllabus','')])
    fill_rows(doc,1,teaching,1)
    if a.get('totalPeriodsPerWeek') is not None: set_cell(doc,1,min(6,len(doc.tables[1].rows)-1),3,a.get('totalPeriodsPerWeek'))
    assignments=[]
    for i,x in enumerate(a.get('assignments',[]),1): assignments.append([i,x.get('classCourse',x.get('class','')),x.get('assignments',''),x.get('tests',''),x.get('record','')])
    fill_rows(doc,2,assignments,1)
    acts=[]
    for i,x in enumerate(a.get('academicActivities',[]),1): acts.append([x.get('title',''),x.get('detail','')])
    fill_rows(doc,3,acts,1)
    results=[]
    for x in a.get('results',[]):
        results.append([x.get('className',x.get('class','')),x.get('duration',''),x.get('appeared',''),x.get('passed',''),x.get('collegePct',x.get('collegePass','')),x.get('universityPct',x.get('universityPass','')),x.get('variation',''),x.get('variation2',x.get('variation','')),x.get('divI',''),x.get('divII',''),x.get('divIII',''),x.get('failed',''),x.get('reason',x.get('reasons',''))])
    fill_rows(doc,4,results,3)
    # 5 orientation/refresher, 6 research
    fill_rows(doc,5,[[x.get('programme',''),x.get('place',''),x.get('duration',''),x.get('rcoc','')] for x in a.get('orientation',[])],1)
    fill_rows(doc,6,[[x.get('title',''),x.get('institution',''),x.get('nature',''),x.get('status','')] for x in a.get('researchProjects',[])],1)
    # API Category I detailed tables
    for i,x in enumerate(teaching,1):
        row=i; 
        if row < len(doc.tables[7].rows):
            # mode/level stored separately in source form; use blank-safe fields from original row format
            src=a.get('teaching',[])[i-1]
            vals=[i,src.get('coursePaper',src.get('classCourse',src.get('class',''))),src.get('level',''),src.get('mode',''),src.get('allocated',''),src.get('delivered',''),src.get('percent',x[-1])]
            for c,v in enumerate(vals): set_cell(doc,7,row,c,v)
    set_cell(doc,8,1,2,f"{scores['classes']:.2f}"); set_cell(doc,8,2,2,f"{scores['extra']:.2f}")
    # resources
    fill_rows(doc,9,[[i+1,x.get('course',''),x.get('consulted',''),x.get('prescribed',''),x.get('additional','')] for i,x in enumerate(api.get('resources',[]))],1)
    set_cell(doc,9,6,4,f"{scores['knowledge']:.2f}")
    fill_rows(doc,10,[[i+1,x.get('description',''),x.get('score','')] for i,x in enumerate(api.get('innovativeActivities',[]))],1)
    set_cell(doc,10,3,2,f"{scores['innovative']:.2f}")
    fill_rows(doc,11,[[i+1,x.get('type',''),x.get('duties',''),x.get('extent',''),x.get('score','')] for i,x in enumerate(api.get('examDuties',[]))],1)
    set_cell(doc,11,3,4,f"{scores['exam']:.2f}")
    # Category II detail table
    c2rows=api.get('category2Rows',[])
    fill_rows(doc,12,[[x.get('sn',''),x.get('type',''),x.get('hours',''),x.get('score','')] for x in c2rows],2)
    set_cell(doc,12,4,3,f"{scores['c2e']:.2f}"); set_cell(doc,12,8,3,f"{scores['c2m']:.2f}"); set_cell(doc,12,10,3,f"{scores['c2p']:.2f}"); set_cell(doc,12,11,3,f"{scores['cat2']:.2f}")
    # Category III tables
    fill_rows(doc,13,[[i+1,x.get('title',''),x.get('journal',''),x.get('issn',''),x.get('peer',''),x.get('coauthors',''),x.get('author',''),x.get('score','')] for i,x in enumerate(api.get('journalPapers',[]))],1)
    fill_rows(doc,14,[[i+1,x.get('title',''),x.get('book',''),x.get('issn',''),x.get('peer',''),x.get('coauthors',''),x.get('mainAuthor',''),x.get('score','')] for i,x in enumerate(api.get('bookChapters',[]))],1)
    fill_rows(doc,15,[[i+1,x.get('title',''),x.get('conference',''),x.get('issn',''),x.get('coauthors',''),x.get('mainAuthor',''),x.get('score','')] for i,x in enumerate(api.get('conferenceProceedings',[]))],1)
    fill_rows(doc,16,[[i+1,x.get('title',''),x.get('type',''),x.get('publisher',''),x.get('peer',''),x.get('coauthors',''),x.get('author',''),x.get('score','')] for i,x in enumerate(api.get('books',[]))],1)
    fill_rows(doc,17,[[i+1,x.get('title',''),x.get('agency',''),x.get('period',''),x.get('amount',''),x.get('score','')] for i,x in enumerate(api.get('ongoingProjects',[]))],1)
    fill_rows(doc,18,[[i+1,x.get('title',''),x.get('agency',''),x.get('period',''),x.get('amount',''),x.get('outcome',''),x.get('score','')] for i,x in enumerate(api.get('completedProjects',[]))],1)
    rg=api.get('researchGuidance',{})
    set_cell(doc,19,1,1,rg.get('mphilEnrolled','')); set_cell(doc,19,1,2,rg.get('mphilSubmitted','')); set_cell(doc,19,1,3,rg.get('mphilAwarded','')); set_cell(doc,19,1,4,rg.get('mphilScore',''))
    set_cell(doc,19,2,1,rg.get('phdEnrolled','')); set_cell(doc,19,2,2,rg.get('phdSubmitted','')); set_cell(doc,19,2,3,rg.get('phdAwarded','')); set_cell(doc,19,2,4,rg.get('phdScore',''))
    fill_rows(doc,20,[[i+1,x.get('programme',''),x.get('duration',''),x.get('organisedBy',''),x.get('score','')] for i,x in enumerate(api.get('training',[]))],1)
    fill_rows(doc,21,[[i+1,x.get('title',''),x.get('conference',''),x.get('organisedBy',''),x.get('level',''),x.get('score','')] for i,x in enumerate(api.get('conferencePapers',[]))],1)
    fill_rows(doc,22,[[i+1,x.get('title',''),x.get('conference',''),x.get('organisedBy',''),x.get('level',''),x.get('score','')] for i,x in enumerate(api.get('invitedLectures',[]))],1)
    set_cell(doc,23,1,2,api.get('lastAcademicYear',{}).get('cat1','')); set_cell(doc,23,1,3,f"{scores['cat1']:.2f}")
    set_cell(doc,23,2,2,api.get('lastAcademicYear',{}).get('cat2','')); set_cell(doc,23,2,3,f"{scores['cat2']:.2f}")
    set_cell(doc,23,3,2,api.get('lastAcademicYear',{}).get('total12','')); set_cell(doc,23,3,3,f"{scores['total12']:.2f}")
    set_cell(doc,23,4,2,api.get('lastAcademicYear',{}).get('cat3','')); set_cell(doc,23,4,3,f"{scores['cat3']:.2f}")
    # other info table 24
    for i,x in enumerate(a.get('otherRelevant',[]),1):
        if i < len(doc.tables[24].rows): set_cell(doc,24,i,0,i); set_cell(doc,24,i,1,x)
    # Replace tokens in XML after table edits.
    tmp=out_docx.with_suffix('.intermediate.docx')
    doc.save(tmp)
    replace_tokens(tmp,out_docx,values)
    tmp.unlink(missing_ok=True)
    # Enclosures: append into list area after replacement by removing sample cleared paragraphs and adding checked list before certificate statement.
    doc=Document(out_docx)
    # Find certificate statement paragraph and insert enclosure list before it.
    selected=[x.get('label') for x in data.get('enclosures',[]) if x.get('checked',True)]
    if selected:
        insert_at=None
        for p in doc.paragraphs:
            if p.text.strip().startswith('I certify that the information provided'):
                insert_at=p
                break
        if insert_at is not None:
            for idx,label in enumerate(selected,1):
                np=insert_at.insert_paragraph_before(f'☑ {idx}. {label}')
                for r in np.runs: r.font.color.rgb=BLUE
    # Append the three official instruction pages to reach the 30-page source format.
    for n in (28,29,30): add_page_break_image(doc, APPENDIX_DIR/f'page-{n}.png')
    doc.save(out_docx)
    return scores

if __name__=='__main__':
    import argparse
    ap=argparse.ArgumentParser(); ap.add_argument('json'); ap.add_argument('-o','--output',default='ACR_generated_v03.docx'); args=ap.parse_args()
    d=json.loads(Path(args.json).read_text(encoding='utf-8'))
    s=generate(d,Path(args.output)); print(json.dumps(s,indent=2))
