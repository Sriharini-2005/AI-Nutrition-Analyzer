const API_BASE_URL = "http://127.0.0.1:8000/api/v1/vision";

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 1. Loading State: Clear old results so you know a new scan is happening
    console.log("Processing meal...");
    const listContainer = document.getElementById("detected-items-list");
    const chipContainer = document.getElementById("quick-questions-area");
    
    if (listContainer) listContainer.innerHTML = "<span>Scanning...</span>";
    if (chipContainer) chipContainer.innerHTML = "";

    const formData = new FormData();
    formData.append("image", file);
    formData.append("user_id", "guest"); 

    try {
        // 2. Call your Python Backend
        const response = await fetch(`${API_BASE_URL}/detect`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) throw new Error("Backend error");

        const data = await response.json();

        // 3. Update the Website UI with REAL data from Python
        updateScannerImage(data.image_b64_thumb); // NEW: Fixes the repeating image issue
        renderDetections(data.detections);
        renderChoiceChips(data.choice_chips);
        
    } catch (error) {
        console.error("Connection Error:", error);
        alert("Check terminal: python -m backend.main must be running.");
    }
}

/**
 * NEW: Replaces the placeholder image with the actual annotated 
 * image from the YOLO model.
 */
function updateScannerImage(base64String) {
    const mainImage = document.querySelector(".meal-scanner img"); 
    if (mainImage && base64String) {
        // Replaces the "Grilled Chicken" placeholder with the new scan
        mainImage.src = `data:image/png;base64,${base64String}`;
    }
}

function renderDetections(detections) {
    const container = document.getElementById("detected-items-list");
    if (!container) return;

    if (!detections || detections.length === 0) {
        container.innerHTML = "<span>No food detected.</span>";
        return;
    }

    // Maps the new labels (e.g., "Apple", "Pizza") to the UI
    container.innerHTML = detections.map(item => 
        `<span class="badge">${item.label} ${Math.round(item.confidence * 100)}%</span>`
    ).join("");
}

function renderChoiceChips(chips) {
    const container = document.getElementById("quick-questions-area");
    if (!container) return;

    if (!chips || chips.length === 0) {
        container.innerHTML = "<p>No extra questions for this meal.</p>";
        return;
    }

    // Renders the specific questions for the detected food
    container.innerHTML = chips.map(chip => `
        <div class="chip-group">
            <p>${chip.q}</p>
            <div class="options">
                ${chip.opts.map(opt => `<button class="chip-btn" onclick="selectOption(this)">${opt}</button>`).join("")}
            </div>
        </div>
    `).join("");
}

// Simple helper to make buttons clickable
function selectOption(btn) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}