# CleanFlow: AI-Driven Waste Optimization for Zero-Waste Events

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built with AI](https://img.shields.io/badge/Built%20with-AI-blueviolet)]()
[![Hackathon Project](https://img.shields.io/badge/Category-Social%20Good-green)]()

> **Empowering cities and event organizers to plan cleaner, smarter, and more sustainable events through AI simulation and optimization.**

---
## 🌍 Overview

Every year, major cities pledge to reduce waste — yet even flagship events like the Olympics struggle to meet their **zero-waste goals** due to inefficient bin placement, unpredictable crowd movement, and limited visibility into waste behavior.

**CleanFlow** reimagines this challenge with a data-driven approach. Using **AI reasoning and agent-based simulation**, CleanFlow predicts where waste is most likely to occur and recommends **optimal bin placement** that minimizes litter and maximizes recycling efficiency.

Inspired by the upcoming **Los Angeles 2028 Olympics**, this project envisions how AI can help LA become the **first zero-waste Olympic city**.

---
## 🎥 Demo Video

<div>
    <a href="https://www.loom.com/share/200a8636453e4f4897ff3a885d6033cd">
    </a>
    <a href="https://www.loom.com/share/200a8636453e4f4897ff3a885d6033cd">
      <img style="max-width:300px;" src="https://cdn.loom.com/sessions/thumbnails/200a8636453e4f4897ff3a885d6033cd-6ab63ca266ae9633-full-play.gif">
    </a>
  </div>

---
## 🧠 Core Features

### 🔹 Map & Heatmap Upload
- Upload a venue layout and optional foot-traffic heatmap.
- If no data is provided, the AI estimates crowd density using total attendees and vendor locations. (In Development)

### 🔹 Interactive Placement Interface
- Drag-and-drop icons (🗑️ bins, 🏪 vendors, 🚪 entries) directly onto the map.

### 🔹 Smart Variable Controls
Configure real-world parameters:
- Estimated number of people per hour
- Capacity per bin
- Target utilization rate per bin
- Cost per bin  
- Vendor trash output per hour

### 🔹 AI Analysis Output
After clicking **Submit**, the AI:
- Calculates *optimal bin placement*
- Reports *% trash captured* and *# of bins reduced*
- Explains reasoning with data 

---

## ⚙️ Technical Architecture

| Component | Description |
|------------|-------------|
| **Frontend** | Lovable-generated UI (React + Tailwind) with map uploads and overlays |
| **Backend** | Python (Mesa / NumPy) for agent-based waste simulation |
| **Optimization Logic** | Multi-objective heuristic minimizing total bins while maximizing trash capture probability |
| **AI Layer** | LLM for reasoning, visualization narration, and report generation |

---

## 📊 Example Metrics

| Metric | Baseline | With CleanFlow |
|--------|-----------|----------------|
| Waste captured | 65% | **95%** |
| Number of bins | 20 | **16 (-20%)** |
| Overflow incidents | 30/day | **0** |
| Recycling rate | 63% | **100%** |
| Cleanup cost | \$2.5 M | **\$2.0 M (-20%)** |

---

## 🧩 Data Sources

| Data Type | Example Source |
|------------|----------------|
| Waste tonnage & bin data | [NYC Open Data](https://data.cityofnewyork.us), [LA Open Data](https://data.lacity.org) |
| Foot-traffic estimates | Google Maps Popular Times, SafeGraph |
| Behavioral coefficients | Keep Britain Tidy (2018), EPA Litter Prevention Study (2021) |
| Venue layouts | OpenStreetMap stadiums, parks, and plazas |
---

## 💡 Impact

- 🌱 **Environmental:** Less litter and landfill waste  
- 🧹 **Operational:** Reduced cleanup time and labor  
- 💰 **Economic:** Lower waste management costs  
- 💬 **Social:** Improved attendee experience and public image  

> “Cleaner cities start with smarter design.”

---

## 🏆 Hackathon Criteria Alignment

| Category | Strength |
|-----------|-----------|
| **Technical Feasibility** | Functional prototype with interactive simulation and optimization. |
| **Identification of Problem** | Tackles a visible sustainability issue faced by every major event. |
| **Novelty of Solution** | First to combine LLM reasoning + ABM waste modeling to optimize bin placement for big events. |
| **Venture Feasibility** | Scalable to campuses, festivals, conventions, fairs and city planning. |

---

## 🚀 Future Directions

- Real-time feedback via IoT smart bins & Camera recordings
- More nuanced model to provide deeper analysis and explanations
- Expanded optimization for water refill stations, popup vendors, other sources (tailgate)
- Pilot partnership with **LA 2028 Organizing Committee**

---

## 🧑‍💻 Team
**Contributors**
- 🧭 Technical Project Lead — *Pannawat Chauychoo*  
- 🤖 Vibe Coding Savant  — *Nicholas Scolieri*  
- 🎨 Product Analyst — *Daniel*  



## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/059dce98-20a1-4c3c-b7b3-b85761a3b69d) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
