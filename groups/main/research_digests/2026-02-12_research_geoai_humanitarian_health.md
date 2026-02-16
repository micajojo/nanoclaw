# PhD Research Digest: GeoAI/GIS & Humanitarian Health Assistance

**Date:** 2026-02-12

**Focus:** Recent literature on Geospatial AI and GIS applications in humanitarian health assistance (2024-2025)

---

## Recent Articles (2024-2025)

### 1. Geospatial Analysis of Childhood Vaccinations in Yemen (2025)

**Citation:** Garber K, Kanth P, Hassen K, et al. Geospatial analysis and scale-up modelling of the impact of mobile programming on access to essential childhood vaccinations in Yemen. *Commun Med.* 2025;5:126. doi:10.1038/s43856-025-00762-5

**Summary:** This study developed a geospatial model of national and subnational vaccination access via fixed health facilities and mobile health teams in Yemen, using conflict-adjusted population datasets accounting for internally displaced persons. The researchers identified optimal locations for new vaccination sites and quantified their potential impact on vaccine accessibility in a protracted humanitarian crisis where childhood vaccination rates remain alarmingly low due to restricted vaccine delivery.

**URL:** https://www.nature.com/articles/s43856-025-00762-5

---

### 2. High-Resolution Refugee Population Mapping (2024)

**Citation:** Darin E, Dicko AH, Galal H, Jimenez RM, Park H, Tatem AJ, Qader S. Mapping refugee populations at high resolution by unlocking humanitarian administrative data. *J Int Humanit Action.* 2024;9(1):7. doi:10.1186/s41018-024-00157-6

**Summary:** This study leveraged registration data on refugees combined with high-resolution population maps, satellite imagery-derived settlement maps, and spatial covariates to disaggregate refugee totals into 100-meter grid cells. The high-resolution spatial information enables improved local decision-making, service delivery planning, and household survey design for vulnerable refugee populations whose spatial variation is harder to capture than general populations due to higher mobility patterns.

**URL:** https://jhumanitarianaction.springeropen.com/articles/10.1186/s41018-024-00157-6

---

### 3. AI Monitoring of Gaza Humanitarian Crisis (2024)

**Citation:** Zhu M, et al. Satellite and AI monitoring humanitarian crises in the Gaza Strip during the early stage of Israeli–Palestinian conflict. *Int J Digit Earth.* 2024;17(1):2430678. doi:10.1080/17538947.2024.2430678

**Summary:** Researchers introduced a rapid framework to evaluate armed conflict impacts and monitor humanitarian crises in Gaza using multi-source satellite imagery and cutting-edge AI techniques. The study quantified total affected vulnerable population exposure at the block level, identifying high-risk humanitarian crisis locations to aid precise allocation of humanitarian resources, revealing that airstrikes destroyed over 20% of buildings including nearly 60% of shops and hospitals and 80% of water infrastructure.

**URL:** https://www.tandfonline.com/doi/full/10.1080/17538947.2024.2430678

---

### 4. Malaria During Humanitarian Crisis in Ethiopia (2025)

**Citation:** Hailemariam GG, Nigusse AT, Amaha MH. The impact of a humanitarian crisis on the magnitude of malaria in Tigray, Northern Ethiopia from 2014 to 2024. *Malar J.* 2025;24(1):122. doi:10.1186/s12936-025-05366-x

**Summary:** This descriptive cross-sectional study analyzed malaria surveillance data from Tigray where the health system was severely damaged during the November 2020 war. Among 7,195,545 suspected cases, 2,185,318 (30.37%) were confirmed malaria cases, with the highest transmission recorded in 2024 (382,955 cases). The study revealed that during conflict, report completeness decreased by 83%, demonstrating how humanitarian crises disrupt disease surveillance systems even as disease burden increases.

**URL:** https://malariajournal.biomedcentral.com/articles/10.1186/s12936-025-05366-x

---

### 5. Climate Vulnerability in Refugee Camps (2025)

**Citation:** Dampha NK, Salemi C, Polasky S, Gebre Egziabher A, Rappeport W. Refugees and host communities' vulnerability to climate and disaster risks in Rwanda. *Front Clim.* 2025;7:1465223. doi:10.3389/fclim.2025.1465223

**Summary:** This study assessed climate and disaster risks in refugee-hosting districts in Rwanda using GIS-based risk mapping, decision science tools (AHP), remote sensing, and econometric analysis. Findings revealed spatial variability in hazard exposure across camps, with Mahama and Mugombwa experiencing highest flood risks while Gihembe, Kiziba, and Kigeme were most susceptible to landslides, with landslides causing 110 fatalities in Kiziba district in 2016 alone.

**URL:** https://www.frontiersin.org/journals/climate/articles/10.3389/fclim.2025.1465223/full

---

## General Summary

### Current State of Research

The 2024-2025 literature demonstrates significant advancement in applying GeoAI and GIS technologies to humanitarian health challenges, particularly in conflict-affected and displacement settings. Geospatial modeling is increasingly used to optimize health intervention delivery in complex humanitarian emergencies, as demonstrated by conflict-adjusted vaccination access modeling in Yemen that identifies optimal new vaccination site locations [1]. High-resolution spatial disaggregation techniques combining refugee registration data with satellite imagery and machine learning now enable 100-meter grid cell population mapping, addressing the challenge that refugee populations are harder to spatially capture than general populations due to mobility patterns [2].

AI-driven satellite monitoring has emerged as a critical tool for real-time humanitarian crisis assessment, with applications ranging from building damage quantification to vulnerable population exposure mapping at block level in Gaza, enabling precise humanitarian resource allocation [3]. These technologies are particularly valuable given that 2024-2025 witnessed unprecedented humanitarian need, with over 300 million people requiring humanitarian assistance and protection—nearly doubling over five years—and development assistance for health declining 21% between 2024-2025 [1][3].

### Key Themes and Patterns

Several interconnected themes emerge from recent literature:

1. **Integration of conflict dynamics into geospatial health models**: Research now routinely incorporates conflict-related effects, internally displaced persons tracking, and security constraints into spatial accessibility models [1][4]

2. **Multi-source data fusion**: Combining humanitarian administrative data, satellite imagery, population modeling, and AI techniques to create actionable intelligence for health intervention targeting [2][3]

3. **Real-time crisis monitoring**: Shift from retrospective analysis to near-real-time assessment capabilities using satellite imagery and AI for rapid humanitarian response [3]

4. **Environmental health risks in displacement settings**: Growing attention to climate-related health vulnerabilities in refugee populations, though still underintegrated with health outcome prediction [5]

5. **Surveillance system resilience**: Recognition that humanitarian crises simultaneously increase disease burden while destroying measurement systems [4]

### Critical Gaps

Three critical gaps persist in the GeoAI/GIS humanitarian health literature:

**First**, disease surveillance system resilience during humanitarian crises remains severely compromised, as evidenced by the 83% decrease in malaria reporting completeness during the Tigray conflict despite increased disease burden [4]. This highlights a fundamental tension: humanitarian crises simultaneously increase disease risk while destroying the surveillance infrastructure needed to measure and respond to that risk. Current research documents this phenomenon but provides limited methodological solutions for maintaining surveillance quality or detecting outbreaks despite degraded reporting systems.

**Second**, while climate-related disaster risks to refugee populations are being mapped using GIS-based approaches identifying spatial variability in flood and landslide exposure [5], there is limited integration of these environmental risk assessments with health outcome prediction models. Studies map where disasters might occur and separately model health intervention access [1], but rarely predict how environmental exposures will translate into specific health outcomes (e.g., flood exposure → waterborne disease outbreaks) to enable proactive rather than reactive response.

**Third**, despite advances in high-resolution population mapping [2], significant methodological challenges remain in capturing self-settled refugee populations and accounting for high mobility patterns in displacement settings. Current approaches work well for camp-based populations with registration data but struggle with dispersed, mobile populations who may be most vulnerable yet least visible to health systems.

### Key Insights for PhD Research

The convergence of GeoAI capabilities with unprecedented humanitarian health needs creates compelling PhD research opportunities at multiple scales:

**At the technical level**, there is urgent need for resilient spatial surveillance systems that maintain data quality during crises and can detect disease outbreaks despite surveillance system degradation [4]. This could involve developing Bayesian spatial models that incorporate uncertainty due to incomplete reporting, machine learning approaches that predict true disease burden from partial surveillance data, or sentinel surveillance network optimization for conflict settings.

**At the intervention optimization level**, geospatial models that integrate conflict dynamics, population displacement, and health facility accessibility—like those demonstrated in Yemen [1]—require expansion to other protracted crises and validation of predicted versus actual coverage improvements. This represents a critical gap between model development and real-world impact assessment.

**At the vulnerability assessment level**, combining environmental risk mapping with health outcome prediction [5] could enable proactive resource pre-positioning rather than reactive crisis response. For example, integrating flood risk maps with cholera transmission models and population displacement patterns could predict outbreak locations before they occur.

**Methodologically**, advancing techniques for real-time population tracking in displacement settings using satellite imagery and AI [2][3] addresses a fundamental challenge in humanitarian health: you cannot effectively deliver health services when you cannot accurately locate the populations in need. This is particularly critical given high mobility in displacement settings and the limitations of registration systems.

### Relevance to PhD Proposal

This literature review reveals several alignments and opportunities for PhD research on GeoAI for humanitarian health intervention outcomes:

1. **Methodological foundation exists**: Recent work demonstrates feasibility of conflict-adjusted geospatial modeling [1], high-resolution population disaggregation [2], and AI-driven crisis monitoring [3], providing proven methodological building blocks

2. **Outcome prediction gap**: While studies optimize intervention access [1] or map population vulnerability [2][5], few predict actual health outcomes (e.g., mortality reduction, disease incidence) from spatial intervention patterns—a critical gap for evidence-based resource allocation

3. **Surveillance challenges**: The documented 83% reporting completeness decline during Tigray crisis [4] highlights need for methods that can maintain outcome measurement quality when traditional surveillance systems fail

4. **Scale and impact**: With 300 million people in humanitarian need and declining development assistance [1][3], tools that optimize limited resources through spatial targeting have enormous potential impact

5. **Multi-hazard integration**: Opportunity to bridge environmental risk mapping [5] with health intervention modeling [1] and population tracking [2][3] into integrated frameworks that predict health outcomes under multiple simultaneous stressors

---

## Bibliography

1. Garber K, Kanth P, Hassen K, et al. Geospatial analysis and scale-up modelling of the impact of mobile programming on access to essential childhood vaccinations in Yemen. Commun Med. 2025;5:126. doi:10.1038/s43856-025-00762-5 https://www.nature.com/articles/s43856-025-00762-5

2. Darin E, Dicko AH, Galal H, Jimenez RM, Park H, Tatem AJ, Qader S. Mapping refugee populations at high resolution by unlocking humanitarian administrative data. J Int Humanit Action. 2024;9(1):7. doi:10.1186/s41018-024-00157-6 https://jhumanitarianaction.springeropen.com/articles/10.1186/s41018-024-00157-6

3. Zhu M, et al. Satellite and AI monitoring humanitarian crises in the Gaza Strip during the early stage of Israeli–Palestinian conflict. Int J Digit Earth. 2024;17(1):2430678. doi:10.1080/17538947.2024.2430678 https://www.tandfonline.com/doi/full/10.1080/17538947.2024.2430678

4. Hailemariam GG, Nigusse AT, Amaha MH. The impact of a humanitarian crisis on the magnitude of malaria in Tigray, Northern Ethiopia from 2014 to 2024. Malar J. 2025;24(1):122. doi:10.1186/s12936-025-05366-x https://malariajournal.biomedcentral.com/articles/10.1186/s12936-025-05366-x

5. Dampha NK, Salemi C, Polasky S, Gebre Egziabher A, Rappeport W. Refugees and host communities' vulnerability to climate and disaster risks in Rwanda. Front Clim. 2025;7:1465223. doi:10.3389/fclim.2025.1465223 https://www.frontiersin.org/journals/climate/articles/10.3389/fclim.2025.1465223/full

---

## Search Strategy

**Search terms used:**
- "GeoAI humanitarian health 2024 2025 2026"
- "GIS humanitarian health assistance 2024 2025"
- "spatial analysis humanitarian health intervention outcomes 2024 2025"
- "geospatial machine learning humanitarian health 2024 2025"
- "satellite imagery AI humanitarian health crisis 2024 2025"
- "spatial epidemiology humanitarian crisis conflict health 2024"
- "remote sensing refugee health vulnerability mapping 2024"
- "spatial analysis vaccination coverage humanitarian settings 2024 2025"

**Databases:** Web search covering academic publishers (Nature, Springer, Frontiers, BMC), preprint servers, and institutional repositories

**Date range:** 2024-2025 publications

**Exclusion criteria:**
- Articles already covered in previous digest
- General disaster management without health focus
- Environmental studies without humanitarian context
- Articles without GeoAI/GIS or humanitarian health assistance focus
