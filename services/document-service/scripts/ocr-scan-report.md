# OCR pipeline scan — real-world ID documents

Generated: 2026-08-14T05:51:34.431Z
Run method: direct call into the QR-first pipeline (`decodeQrFromImage` → `parseQrPayload`; `prepareImage` → tesseract.js `recognize`; `mergeQrAndOcr` per-field, QR wins on conflict) — no upload / DB / auth.

| File | Detected type | QR | Confidence | Unreadable | Needs review | Fields extracted |
| --- | --- | --- | --- | --- | --- | --- |
| Aadhaar_example_3.webp | AADHAAR_CARD | aadhaar-print-letter | 99.0 | no | no | Name, DOB, Gender, Aadhaar, Address |
| aadhar_example.webp | AADHAAR_CARD | aadhaar-legacy-numeric | 54.0 | no | no | Name, DOB, Gender, Aadhaar, Address |
| aadhar_example_2.webp | AADHAAR_CARD | none | 51.0 | no | yes | Name, DOB, Aadhaar (low-conf: extractedDob) |
| DL_example.jpg | ADDRESS_PROOF | none | 49.0 | no | yes | (none) |
| DL_example_2.jpg | ADDRESS_PROOF | none | 78.0 | no | no | Name, DOB, Address, Licence number |
| pan_example.jpg | PAN_CARD | none | 44.0 | no | yes | PAN |
| pan_example_2.webp | PAN_CARD | none | 33.0 | no | yes | DOB, PAN, Father's name (low-conf: extractedDob) |

## Aadhaar_example_3.webp

- **Detected document type:** AADHAAR_CARD
- **Image:** webp, 2048x1395
- **Preprocess:** resized to 2000x1362, skew estimate 0.0°, at scan boundary no, ink ratio 38.22%
- **QR:** aadhaar-print-letter
- **QR fields:**
  - **Name:** Niranjan Kumar
  - **DOB:** 12/04/2000
  - **Gender:** Male
  - **Aadhaar:** 483586226030
  - **Address:** S/O: Rajkumar Gupta, Salempur, Nandlalpur, Vaishali, Vaishali, Bihar, 844113
- **OCR skipped:** QR covered every expected field
- **OCR confidence:** 99.0
- **Flagged unreadable:** no
- **Needs manual review:** no
- **Fields extracted (source):**
  - **Name:** Niranjan Kumar `[qr]`
  - **DOB:** 12/04/2000 `[qr]`
  - **Gender:** Male `[qr]`
  - **Aadhaar:** 483586226030 `[qr]`
  - **Address:** S/O: Rajkumar Gupta, Salempur, Nandlalpur, Vaishali, Vaishali, Bihar, 844113 `[qr]`

**Raw OCR text (261 chars):**

```
<?xml version="1.0" encoding="UTF-8"?>
<PrintLetterBarcodeData uid="483586226030" name="Niranjan Kumar" gender="M" yob="2000" co="S/O: Rajkumar Gupta" vtc="Salempur" po="Nandlalpur" dist="Vaishali" subdist="Vaishali" state="Bihar" pc="844113" dob="12/04/2000"/>
```

**Raw QR payload (261 chars):**

```
<?xml version="1.0" encoding="UTF-8"?>
<PrintLetterBarcodeData uid="483586226030" name="Niranjan Kumar" gender="M" yob="2000" co="S/O: Rajkumar Gupta" vtc="Salempur" po="Nandlalpur" dist="Vaishali" subdist="Vaishali" state="Bihar" pc="844113" dob="12/04/2000"/>
```

## aadhar_example.webp

- **Detected document type:** AADHAAR_CARD
- **Image:** webp, 768x972
- **Preprocess:** resized to 768x972, skew estimate 0.0°, at scan boundary no, ink ratio 18.32%
- **QR:** aadhaar-legacy-numeric (contains photo — omitted from report)
- **QR fields:**
  - **Name:** Vilas Rakhe
  - **DOB:** 30/05/1995
  - **Gender:** Male
  - **Address:** Jalna, ROW H.n. 2 sonal nagar Opp. chavan saheb home, 431203, Jalna, Maharashtra, Subhadra Niwas near railway station, Jalna, 4583
- **OCR confidence:** 54.0
- **Flagged unreadable:** no
- **Needs manual review:** no
- **Fields extracted (source):**
  - **Name:** Vilas Rakhe `[qr]`
  - **DOB:** 30/05/1995 `[qr]`
  - **Gender:** Male `[qr]`
  - **Aadhaar:** 773008892163 `[ocr]`
  - **Address:** Jalna, ROW H.n. 2 sonal nagar Opp. chavan saheb home, 431203, Jalna, Maharashtra, Subhadra Niwas near railway station, Jalna, 4583 `[qr]`

**Raw OCR text (959 chars):**

```
w HIE ERC A
a Government of india halilad
2 ww fea
H | Vilas Rakhe
5 A 8 w+ ai@/DOB: 30/05/1995
§ 4 e/ MALE
H ure #1 sivasdar yarn and, fv far smal smh.
g 8 waa usarevitsrd} ard wa (svar wane Fa ar Ss
§ THF) SBT XM
Hl Aadhaar is proof of identity, not of citizenship
< or date of birth. It should be used with verification {online
authentication, or scanning of QR cade / offline XML).
7730 0889 2163
HATST ATEN, HATS 37s i
bd ah afte see wifteor A)
ab Unique Identification Authority of India ~~ Z20
on
A FA. 3 AFA TR FE TR FR, I EN Erma ensaiam
AX RI SEB, SAA, SA, SA, eid Gi Emi
SER - 431203 es ro
i egal
KAddress: pS wr LIE Toba 5
5 Foley ign 3 i RE
ROW H.n. 2 sonal nagar Opp. chavan saheb er SR
Shome, Subhadra Niwas near railway station, $5 ENR ey
4 Jalna, PO: Jalna, DIST: Jalna, Hee a8 2, Be
“Maharashtra - 431203 ein Pk
i oni A pany
a rg i
25 o 2S i FEAT
7730 0889 2163
VID : 9186 7890 6417 0314
ax 19a7 | E=g help@uidai.gov.in | 3 www.uidai.gov.in

```

**Raw QR payload (52 chars):**

```
[legacy numeric payload: 3133 digits, photo omitted]
```

## aadhar_example_2.webp

- **Detected document type:** AADHAAR_CARD
- **Image:** webp, 768x999
- **Preprocess:** resized to 768x999, skew estimate 2.0°, at scan boundary no, ink ratio 21.93%
- **QR:** none found
- **OCR confidence:** 51.0
- **Flagged unreadable:** no
- **Needs manual review:** yes
- **Low-confidence fields:** extractedDob
- **Fields extracted (source):**
  - **Name:** Anjali `[ocr]`
  - **DOB:** 18/09/1599 `[ocr]`
  - **Aadhaar:** 226816223671 `[ocr]`

**Raw OCR text (511 chars):**

```
2 Ta A)
p—r4 Tay
J FD
S Anjali
H C. w= fat 1 DOB : 18/09/1599
2 a #4 FEMALE
H h Mobile No. 9582539507
a 2268 1622 3671
VID 19111 8122 7978 3936
mw Aen AT HUR, AN gare
"Small: fw wre grfirgror
od Ror 0s A)
——_— AADHAAR
LA , ws —
D NM PER, FOTH Ao § - 36%, TH Fo 94, Sy Aas NW
he TR, AEE, IR ge, deine
Ref - 110003 a
MAAR
Address EAT RY
D/O Mukesh Kumar H No E - 376 Street 58 nhets
No. 15 Ashok Nagar Shahdara Mando!
Saboli North East Delhi - 110093
2268 1622 3671
AR 1947 | [J newguidaigovin | ZB www. shsa gov

```

## DL_example.jpg

- **Detected document type:** ADDRESS_PROOF (driving licence)
- **Image:** webp, 1728x972
- **Preprocess:** resized to 1728x972, skew estimate 10.0°, at scan boundary no, ink ratio 46.52%
- **Preprocess issues:** large rotation applied: 10.0°
- **QR:** none found
- **OCR confidence:** 49.0
- **Flagged unreadable:** no
- **Needs manual review:** yes
- **Fields extracted (source):**
  - (none)

**Raw OCR text (471 chars):**

```
N .
ag .
4 § Yi Indi, Unio, Driyj, Li
gr Cence
oR Issueq by SOVERMME{ Li WEST Beng,
TH arg Wwe23 207 502239,
- bole Date Validity, Validity (7g. > .
-— _ 8-04.50 13032034 4 = g. 5
| ~'r NF
h @
Pp h Prue Hoty ©
Holder, SIA re 3
y Name. BHAsKAR ADHIKARy z
L Date of Birth: 14-03. 1974 Blooy Group: U Organ Dong: N Z
Sony Daughier yy, of: NARAYAN ADHIKARY 5 :
CSE Lane NALTA DUM ppg CANTT N24pGs po PS DUM Dua KOLKATA west 5
BENGA( BARRACKpyp 124 PARG ANAS NORTH 70005
TT —

```

## DL_example_2.jpg

- **Detected document type:** ADDRESS_PROOF (driving licence)
- **Image:** png, 741x472
- **Preprocess:** resized to 740x471, skew estimate 0.0°, at scan boundary no, ink ratio 18.58%
- **QR:** none found
- **OCR confidence:** 78.0
- **Flagged unreadable:** no
- **Needs manual review:** no
- **Fields extracted (source):**
  - **Name:** ANURAG BREJA `[ocr]`
  - **DOB:** 09/02/1976 `[ocr]`
  - **Address:** i HNO-178 A2/B MIG FLATS PASCHIM `[ocr]`
  - **Licence number:** DL-0420110145646 `[ocr]`

**Raw OCR text (435 chars):**

```
Bh
Transport Department Government of Delhi
Licence to Drive Vehicles Throughout India
Licence No. : DL-0420110145646 ® N
Name : ANURAG BREJA
S/W/D : BODH RAJ BREJA
— DOB: 09/02/1976 BG: U
Address :
i HNO-178 A2/B MIG FLATS PASCHIM
BN a VIHAR, DELHI 110063
— 4
Authorisation to Drive Date of Issue _&!*
INVCRG 01/03/2011
==
<=
(Holder's Signature)
Issue Date : 01/03/2011
Validity © 08/02/2026 TO
InvCarrNo : NA Issuing Authority (WZ)

```

## pan_example.jpg

- **Detected document type:** PAN_CARD
- **Image:** heif, 600x400
- **Preprocess:** resized to 600x400, skew estimate 0.5°, at scan boundary no, ink ratio 10.16%
- **QR:** none found
- **OCR confidence:** 44.0
- **Flagged unreadable:** no
- **Needs manual review:** yes
- **Fields extracted (source):**
  - **PAN:** BNZPM2501F `[ocr]`

**Raw OCR text (182 chars):**

```
Su cad Erin bi ARE AHR
INCOME TAX DEPARTMENT GOVT. OF INDIA
D MANIKANDAN - TE A
DURAISAMY ped] %
sy FLT
1610711986 Lass
Permeneni Account Number
BNZPM2501F o]
Signature . ls -
2 + N

```

## pan_example_2.webp

- **Detected document type:** PAN_CARD
- **Image:** webp, 768x1024
- **Preprocess:** resized to 768x1024, skew estimate 0.0°, at scan boundary no, ink ratio 52.01%
- **Preprocess issues:** binarized ink ratio very high — dark image, Otsu threshold may be wrong
- **QR:** none found
- **OCR confidence:** 33.0
- **Flagged unreadable:** no
- **Needs manual review:** yes
- **Low-confidence fields:** extractedDob
- **Fields extracted (source):**
  - **DOB:** 14/04/1907 `[ocr]`
  - **PAN:** FFQPD2288B `[ocr]`
  - **Father's name:** SERRA AFZAL ANISH `[ocr]`

**Raw OCR text (267 chars):**

```
INCOMETAXDEPAKTMENT % GOVT. OF INDIA
i wr dn wen wd Sp TRE as
FFQPD2288B pale
Sar
x fo Ch
SOHRAAB DANISH ev 5 ia
Fo or wer / Father's Name SERRA bb
AFZAL ANISH.
a a 04022018
SERN
14/04/1907 _ Lo) °
d ) * ) 3 Fy LO
EY Lp: AA
. SEE 8 Py gy Priel
EE 2 i oi Bis
~% : ARS

```
