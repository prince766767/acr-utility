# ACR Utility — Field Specification v0.1

## Source of truth
Official reference: `UGC_ACR _Form.pdf`, 30 pages.

The source explicitly defines Part-I personal data (Points 1–16), Part-II self appraisal (17–25), PBAS/API (26–29), Point 30 Other Relevant Information + List of Enclosures, and Part III beginning at Point 31 for the Reporting Officer.

## Scope boundary
### Digital entry by the employee
- Points 1–16
- Points 17–25
- Points 26–29
- Point 30
- List of Enclosures
- Employee certification/signature area where applicable, but not Reporting Officer/Principal assessment content unless the official workflow is explicitly confirmed.

### Left blank for manual completion
- Part III Section I — Reporting Officer
- Part III Section II — Reporting Officer API evaluation
- Part IV — Screening/Reviewing/Countersigning portions

## Persistent profiles
### College profile
- College name
- District/State
- PIN
- Address
- Principal name
- Other recurring institutional details

### Employee profile
- Full name
- Father/Husband name
- Employee code
- Subject
- Appointment date
- Designation
- Pay band / grade pay
- Basic pay
- Promotion date
- Academic qualification
- Professional qualification
- Research degree
- Date of birth
- Service status
- Permanent address
- Telephone/mobile
- Email

## Annual fields
- Session/year
- Colleges served during year + duration
- Departmental exam details / Hindi details where applicable
- Other assignment
- Self-appraisal narrative
- Weekly timetable
- Assignments/class tests
- Academic activities
- Books read + extract
- Teaching problems
- Examination results
- Fresh qualifications
- Orientation/refresher/summer school
- Research details
- Awards
- Position/pay response
- Other significant information

## Repeatable data structures
- Teaching/timetable rows
- Assignment/test rows
- Examination-result rows
- Publications
- Book chapters/articles
- Conference proceedings papers
- Books
- Ongoing/completed projects and consultancies
- Research guidance
- Training/FDPs
- Conference/seminar/workshop papers
- Invited lectures/chairmanships
- Other relevant credentials
- Enclosures

## API engine
Category I source maxima:
- Classes Taken: 50
- Teaching load in excess of UGC norm: 10
- Additional resources/syllabus enrichment: 20
- Innovative teaching-learning/course improvement: 20
- Examination duties: 25
- Category I maximum: 125

Category II source maxima:
- Extension/co-curricular/field based: 20
- Corporate life/management: 15
- Professional development: 15
- Reportable Category II total: 25

Category III: implement each source-defined scoring rule from the official instruction pages before enabling authoritative auto-scoring.

## Generation requirements
- A4 output
- Preserve official typography, tables, headings and appearance
- Narrow margins may be used only where required to prevent clipping, but visual design must remain unchanged
- Dynamic vertical expansion for long answers
- Dynamic repeatable rows
- Intelligent page breaks
- Repeat table headers where appropriate
- Continuous automatic page numbering
- Checkbox-based List of Enclosures
- Generate DOCX and PDF
- Append official blank Reporting Officer/Reviewing Officer pages
- Never populate their assessment fields from the employee app
