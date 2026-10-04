# PBAS/API self-assessment rules

The calculator is intentionally explicit and versioned in `public/api-rules.js`. It is based on the UGC 2010 Appendix-I schedule used by the supplied ACR instructions.

| Area | Rule used |
|---|---|
| Category I | Classes taken is `50 x conducted / allocated`, capped at 50. The other self-assessed components are capped at 10, 20, 20 and 25. |
| Category II | Activity subtotals are capped at 20, 15 and 15; the official ACR annual total is capped at 25. |
| Refereed / recognized / proceedings paper | 15 / 10 / 10 base points. Indexed: +5; impact factor 1-<2: +10, 2-<5: +15, 5-10: +25. |
| Joint publication | A sole author gets all points. Otherwise 60% is split among first/principal/corresponding authors and 40% among remaining authors. |
| Books / chapters | International book 50, international chapter 10, national book 25, national chapter 5, local book 15, local chapter 3, international knowledge-volume chapter 10, national knowledge-volume chapter 5. |
| Sponsored project (college) | >5 lakh: 20; 3-5 lakh: 15; 25,000-3 lakh: 10. |
| Consultancy (college) | 10 per complete 2 lakh mobilized. |
| Completed project | Major 20; minor 10. |
| Outcome | National policy document 30; international patent/output 50. |
| Research guidance | M.Phil awarded 3; Ph.D awarded 10; Ph.D thesis submitted 7. |
| Training / FDP | >=2 weeks: 20; one week: 10; training subtotal capped at 30. |
| Conference presentation | International 10; national 7.5; state/regional 5; local/university/college 3. |
| Invited lecture | International 10; national 5. |

The supplied form’s authoritative instructions govern. If its local rules differ from these defaults, update the `RULES` object (and its test) rather than changing totals manually. This preserves an audit trail.
