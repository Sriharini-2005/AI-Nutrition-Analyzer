import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Camera,
  Upload,
  User,
  Target,
  TrendingUp,
  Plus,
  RotateCcw,
  Check,
  AlertCircle,
  Calendar,
  ChevronRight,
  Scale,
  Utensils,
  Flame,
  Sparkles,
  Info,
  Award
} from "lucide-react";

// Types
interface UserProfile {
  name: string;
  age: number;
  gender: string;
  weight: number;
  height: number;
  activity: string;
  goal: string;
  bmr: number;
  tdee: number;
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

interface FoodItem {
  name: string;
  g: number;
  cal: number;
  p: number;
  c: number;
  f: number;
  color: string;
}

interface LoggedMeal {
  id: number;
  name: string;
  emoji: string;
  time: string;
  cal: number;
  p: number;
  c: number;
  f: number;
  score: number;
  items: FoodItem[];
  suggestion: string;
}

interface Detection {
  label: string;
  conf: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

interface PrepQuestion {
  q: string;
  opts: string[];
}

interface CheckIn {
  date: string;
  weight: number;
  delta: number | null;
  message: string;
}

export default function App() {
  // Navigation & Core Profile State
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("pg_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [meals, setMeals] = useState<LoggedMeal[]>(() => {
    const saved = localStorage.getItem("pg_meals");
    return saved ? JSON.parse(saved) : [];
  });

  const [checkins, setCheckins] = useState<CheckIn[]>(() => {
    const saved = localStorage.getItem("pg_checkins");
    return saved ? JSON.parse(saved) : [];
  });

  const [onboardingDoneAt, setOnboardingDoneAt] = useState<number | null>(() => {
    const saved = localStorage.getItem("pg_onboarding_at");
    return saved ? Number(saved) : null;
  });

  const [currentScreen, setCurrentScreen] = useState<"dashboard" | "scan" | "checkin">(() => {
    const saved = localStorage.getItem("pg_user");
    return saved ? "dashboard" : "scan"; // Show scan or onboarding welcome
  });

  // Onboarding UI state
  const [onboardingStep, setOnboardingStep] = useState(0); // 0: welcome banner, 1: profile, 2: measurements, 3: goal
  const [fName, setFName] = useState("");
  const [fAge, setFAge] = useState("");
  const [fWeight, setFWeight] = useState("");
  const [fHeight, setFHeight] = useState("");
  const [genderSel, setGenderSel] = useState<string | null>(null);
  const [activitySel, setActivitySel] = useState("moderate");
  const [goalSel, setGoalSel] = useState<string | null>(null);

  // Upload & Scanning state
  const [image, setImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [questions, setQuestions] = useState<PrepQuestion[]>([]);
  const [chipAnswers, setChipAnswers] = useState<Record<string, string>>({});
  const [isCalculating, setIsCalculating] = useState(false);
  const [currentNutrition, setCurrentNutrition] = useState<{
    items: FoodItem[];
    plateScore: number;
    suggestion: string;
  } | null>(null);

  // Checkin input state
  const [ciWeight, setCiWeight] = useState("");
  const [checkInResult, setCheckInResult] = useState<{
    message: string;
    newTarget: number;
  } | null>(null);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; icon: string; show: boolean }>({
    message: "",
    icon: "✓",
    show: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state to LocalStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem("pg_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("pg_user");
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem("pg_meals", JSON.stringify(meals));
  }, [meals]);

  useEffect(() => {
    localStorage.setItem("pg_checkins", JSON.stringify(checkins));
  }, [checkins]);

  useEffect(() => {
    if (onboardingDoneAt) {
      localStorage.setItem("pg_onboarding_at", String(onboardingDoneAt));
    } else {
      localStorage.removeItem("pg_onboarding_at");
    }
  }, [onboardingDoneAt]);

  // Toast controller
  const showToast = (message: string, icon = "✓") => {
    setToast({ message, icon, show: true });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 3400);
  };

  // Onboarding calculations
  const handleOnboardingNext = (step: number) => {
    if (step === 1) {
      setOnboardingStep(1);
      return;
    }
    if (step === 2) {
      if (!fName.trim() || !fAge || !genderSel) {
        showToast("Please fill in all about you fields.", "⚠️");
        return;
      }
      setOnboardingStep(2);
      return;
    }
    if (step === 3) {
      if (!fWeight || !fHeight) {
        showToast("Please enter your weight and height.", "⚠️");
        return;
      }
      setOnboardingStep(3);
    }
  };

  const handleCompleteOnboarding = () => {
    if (!goalSel) {
      showToast("Please select your primary fitness goal.", "⚠️");
      return;
    }

    const age = parseInt(fAge);
    const weight = parseFloat(fWeight);
    const height = parseFloat(fHeight);

    // Mifflin-St Jeor BMR Formula
    let bmr = 10 * weight + 6.25 * height - 5 * age + (genderSel === "male" ? 5 : -161);
    const actMult: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    };
    const tdee = Math.round(bmr * (actMult[activitySel] || 1.55));
    const goalAdj: Record<string, number> = { lose: -500, maintain: 0, gain: 300 };
    const targetCal = Math.max(1200, tdee + goalAdj[goalSel]);

    // Split multipliers
    const splitMap: Record<string, [number, number, number]> = {
      lose: [0.35, 0.3, 0.35], // P, F, C
      gain: [0.3, 0.25, 0.45],
      maintain: [0.3, 0.3, 0.4],
    };
    const split = splitMap[goalSel];
    const targets = {
      calories: targetCal,
      protein: Math.round((targetCal * split[0]) / 4),
      fat: Math.round((targetCal * split[1]) / 9),
      carbs: Math.round((targetCal * split[2]) / 4),
    };

    const profile: UserProfile = {
      name: fName.trim(),
      age,
      gender: genderSel,
      weight,
      height,
      activity: activitySel,
      goal: goalSel,
      bmr: Math.round(bmr),
      tdee,
      targets,
    };

    setUser(profile);
    setOnboardingDoneAt(Date.now());
    showToast(`Welcome, ${profile.name}! Your plan is ready 🎉`, "✦");
    setTimeout(() => {
      setCurrentScreen("dashboard");
    }, 600);
  };

  // Image Upload logic
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === "string") {
        setImage(e.target.result);
        triggerFoodDetection(e.target.result, file.type);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      processImageFile(file);
    }
  };

  // Stage 1 API call: Detect food ingredients & preparation questions
  const triggerFoodDetection = async (base64Image: string, type: string) => {
    setIsDetecting(true);
    setDetections([]);
    setQuestions([]);
    setChipAnswers({});
    setCurrentNutrition(null);

    try {
      const response = await fetch("/api/detect-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image, mimeType: type }),
      });

      if (!response.ok) {
        throw new Error("Failed to communicate with food detection server API.");
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setDetections(data.detections || []);
      setQuestions(data.questions || []);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "An error occurred during scanning.", "⚠️");
      // Fallback dummy simulation if API fails or is not setup yet
      triggerMockDetection();
    } finally {
      setIsDetecting(false);
    }
  };

  const triggerMockDetection = () => {
    showToast("Server unavailable. Loading simulated preview...", "ℹ️");
    setDetections([
      { label: "Grilled Chicken", conf: 0.93, x: 0.08, y: 0.12, w: 0.3, h: 0.38, color: "#00e5a0" },
      { label: "White Rice", conf: 0.88, x: 0.44, y: 0.08, w: 0.28, h: 0.45, color: "#f59e0b" },
      { label: "Salad Greens", conf: 0.81, x: 0.55, y: 0.52, w: 0.32, h: 0.38, color: "#38bdf8" },
      { label: "Sesame Dressing", conf: 0.76, x: 0.14, y: 0.56, w: 0.18, h: 0.22, color: "#f43f5e" },
    ]);
    setQuestions([
      { q: "Cooking Method", opts: ["Grilled", "Fried", "Steamed", "Baked"] },
      { q: "Oil Level", opts: ["None", "Light", "Medium", "Heavy"] },
      { q: "Sauce Type", opts: ["Tomato-based", "Cream-based", "Light/Vinegar", "No Sauce"] },
      { q: "Rice Type", opts: ["White Rice", "Brown Rice", "Cauliflower Rice", "None"] },
    ]);
  };

  // Answer selection handler
  const handleSelectChip = (question: string, option: string) => {
    setChipAnswers((prev) => ({
      ...prev,
      [question]: option,
    }));
  };

  const allQuestionsAnswered = () => {
    return questions.length > 0 && Object.keys(chipAnswers).length === questions.length;
  };

  // Stage 2 API Call: Calculate precise nutrition details
  const triggerNutritionCalculation = async () => {
    setIsCalculating(true);
    try {
      const response = await fetch("/api/calculate-nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          mimeType,
          detections,
          answers: chipAnswers,
          profile: user,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to communicate with nutrition calculation server API.");
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setCurrentNutrition({
        items: data.items || [],
        plateScore: data.plateScore || 50,
        suggestion: data.suggestion || "Enjoy your meal!",
      });
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Could not calculate nutrition.", "⚠️");
      // Fallback simulation
      triggerMockNutrition();
    } finally {
      setIsCalculating(false);
    }
  };

  const triggerMockNutrition = () => {
    const oilLevel = chipAnswers["Oil Level"] || "Light";
    const cookMethod = chipAnswers["Cooking Method"] || "Grilled";
    const oilMult = { None: 1.0, Light: 1.05, Medium: 1.15, Heavy: 1.28 }[oilLevel] || 1.05;
    const cookMult = { Grilled: 1.0, Baked: 1.0, Steamed: 0.95, Fried: 1.22 }[cookMethod] || 1.0;
    const mult = oilMult * cookMult;

    const baseItems = [
      { name: "Grilled Chicken", g: 130, cal: 215, p: 40.3, c: 0, f: 4.7, color: "#00e5a0" },
      { name: "White Rice", g: 150, cal: 195, p: 4.0, c: 43.0, f: 0.4, color: "#f59e0b" },
      { name: "Salad Greens", g: 80, cal: 22, p: 1.2, c: 3.8, f: 0.2, color: "#38bdf8" },
      { name: "Sesame Dressing", g: 35, cal: 48, p: 0.5, c: 5.2, f: 2.6, color: "#f43f5e" },
    ];

    const adjusted = baseItems.map((item) => ({
      ...item,
      cal: Math.round(item.cal * mult),
      f: Math.round(item.f * mult * 10) / 10,
    }));

    // Generate simulated advice
    let suggestion =
      "Great choice! This is an incredibly balanced plate. Choosing brown rice or adding extra high-fiber vegetables would lower the overall glycemic load even further.";
    if (oilLevel === "Heavy") {
      suggestion =
        "The heavy oil content makes this plate higher in dietary fat. Consider asking for dressings on the side or choosing baking/steaming next time to save up to 140 calories.";
    }

    setCurrentNutrition({
      items: adjusted,
      plateScore: 82,
      suggestion,
    });
  };

  const handleSaveMeal = () => {
    if (!currentNutrition) return;

    const totalCal = currentNutrition.items.reduce((sum, item) => sum + item.cal, 0);
    const totalP = currentNutrition.items.reduce((sum, item) => sum + item.p, 0);
    const totalC = currentNutrition.items.reduce((sum, item) => sum + item.c, 0);
    const totalF = currentNutrition.items.reduce((sum, item) => sum + item.f, 0);

    const emojis = ["🍗", "🥗", "🍚", "🥩", "🥑", "🥕", "🍜", "🍕", "🥙"];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    const now = new Date();
    const formattedTime = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const newMeal: LoggedMeal = {
      id: Date.now(),
      name: currentNutrition.items.map((i) => i.name).join(", "),
      emoji: randomEmoji,
      time: formattedTime,
      cal: totalCal,
      p: Math.round(totalP * 10) / 10,
      c: Math.round(totalC * 10) / 10,
      f: Math.round(totalF * 10) / 10,
      score: currentNutrition.plateScore,
      items: currentNutrition.items,
      suggestion: currentNutrition.suggestion,
    };

    setMeals((prev) => [newMeal, ...prev]);
    showToast("Meal successfully logged to your tracker! ✓", "✦");
    handleResetScan();
    setTimeout(() => {
      setCurrentScreen("dashboard");
    }, 800);
  };

  const handleResetScan = () => {
    setImage(null);
    setMimeType(null);
    setDetections([]);
    setQuestions([]);
    setChipAnswers({});
    setCurrentNutrition(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Submit check-in weight
  const handleSubmitCheckin = () => {
    const weightVal = parseFloat(ciWeight);
    if (!weightVal || weightVal < 20 || weightVal > 300) {
      showToast("Please enter a valid weight between 20kg and 300kg.", "⚠️");
      return;
    }

    if (!user) {
      showToast("Please finish your onboarding setup first.", "⚠️");
      return;
    }

    const previousWeight = checkins.length > 0 ? checkins[checkins.length - 1].weight : user.weight;
    const delta = Math.round((weightVal - previousWeight) * 10) / 10;
    const goal = user.goal;

    const expectedDelta = goal === "lose" ? -1.0 : goal === "gain" ? 0.5 : 0.0;
    const diff = delta - expectedDelta;

    let message = "";
    let calAdjustment = 0;

    if (Math.abs(diff) < 0.3) {
      message = "Brilliant! You are precisely on track with your progress profile. Keep doing what you do! 🎯";
    } else if ((goal === "lose" && diff > 0.3) || (goal === "gain" && diff < -0.3)) {
      calAdjustment = goal === "lose" ? -150 : 150;
      message = `Progress is slightly slower than expected. To optimize progress, your target has been recalibrated by ${calAdjustment > 0 ? "+" : ""}${calAdjustment} kcal.`;
    } else {
      calAdjustment = goal === "lose" ? 100 : -100;
      message = `Progress is advancing ahead of schedule. Adjusting your intake targets upwards by ${calAdjustment > 0 ? "+" : ""}${calAdjustment} kcal to ensure it remains healthy and sustainable.`;
    }

    const updatedUser = { ...user };
    if (calAdjustment !== 0) {
      updatedUser.targets.calories = Math.max(1200, updatedUser.targets.calories + calAdjustment);
    }
    updatedUser.weight = weightVal;
    setUser(updatedUser);

    const newCheckin: CheckIn = {
      date: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      weight: weightVal,
      delta: checkins.length > 0 ? delta : null,
      message,
    };

    setCheckins((prev) => [newCheckin, ...prev]);
    setCheckInResult({
      message,
      newTarget: updatedUser.targets.calories,
    });
    setCiWeight("");
    showToast("Check-in logged! Intake plan updated.", "✦");
  };

  const handleResetApp = () => {
    if (window.confirm("Are you sure you want to reset all profile data and log history? This cannot be undone.")) {
      setUser(null);
      setMeals([]);
      setCheckins([]);
      setOnboardingDoneAt(null);
      setOnboardingStep(0);
      setFName("");
      setFAge("");
      setFWeight("");
      setFHeight("");
      setGenderSel(null);
      setGoalSel(null);
      handleResetScan();
      setCurrentScreen("scan");
      showToast("All data successfully cleared.", "ℹ️");
    }
  };

  // Calendar stats calculations
  const today = new Date().toDateString();
  const todayMeals = meals.filter((meal) => new Date(meal.id).toDateString() === today);

  const consumedCalories = todayMeals.reduce((sum, meal) => sum + meal.cal, 0);
  const consumedProtein = todayMeals.reduce((sum, meal) => sum + meal.p, 0);
  const consumedCarbs = todayMeals.reduce((sum, meal) => sum + meal.c, 0);
  const consumedFat = todayMeals.reduce((sum, meal) => sum + meal.f, 0);

  const targetCal = user?.targets?.calories || 2000;
  const targetP = user?.targets?.protein || 130;
  const targetC = user?.targets?.carbs || 220;
  const targetF = user?.targets?.fat || 65;

  const remainingCal = Math.max(0, targetCal - consumedCalories);

  const daysSinceOnboarding = onboardingDoneAt
    ? Math.floor((Date.now() - onboardingDoneAt) / 86400000)
    : 0;
  const checkinDaysProgress = Math.min(daysSinceOnboarding, 14);
  const daysUntilCheckin = Math.max(0, 14 - checkinDaysProgress);

  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-100 flex flex-col font-body">
      {/* ═══════════════════════════════════════════════
           TOAST NOTIFICATION
         ═══════════════════════════════════════════════ */}
      <div
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900 border border-white/10 px-6 py-3.5 rounded-2xl shadow-2xl transition-all duration-300 z-50 ${
          toast.show ? "translate-y-0 opacity-100 scale-100" : "translate-y-12 opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <span className="text-emerald-400 text-lg">{toast.icon}</span>
        <span className="text-sm font-medium">{toast.message}</span>
      </div>

      {/* ═══════════════════════════════════════════════
           NAVIGATION BAR
         ═══════════════════════════════════════════════ */}
      {user && (
        <nav className="navbar flex items-center justify-between px-6 md:px-10 py-5 border-b border-white/5 bg-[#0a0e17]/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <div className="w-[38px] h-[38px] bg-accent rounded-xl flex items-center justify-center text-lg shadow-lg shadow-emerald-500/20">
              🛡️
            </div>
            <span className="font-head font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              PlateGuardian
            </span>
          </div>

          <div className="flex gap-1.5 bg-[#1a2235] border border-white/5 rounded-xl p-1">
            <button
              onClick={() => setCurrentScreen("dashboard")}
              className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                currentScreen === "dashboard"
                  ? "bg-accent text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => {
                handleResetScan();
                setCurrentScreen("scan");
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                currentScreen === "scan"
                  ? "bg-accent text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Scan Meal
            </button>
            <button
              onClick={() => setCurrentScreen("checkin")}
              className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                currentScreen === "checkin"
                  ? "bg-accent text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Check-in
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-full bg-[#1a2235] border border-white/10 flex items-center justify-center text-sm">
              👤
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-bold text-white leading-none">{user.name}</span>
              <span className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wider">{user.goal}</span>
            </div>
          </div>
        </nav>
      )}

      {/* ═══════════════════════════════════════════════
           MAIN WORKSPACE CANVAS
         ═══════════════════════════════════════════════ */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6">
        <AnimatePresence mode="wait">
          {/* ═══════════════════════════════════════════════
               ONBOARDING SECTION
             ═══════════════════════════════════════════════ */}
          {!user && (
            <motion.div
              key="onboarding"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full"
            >
              {onboardingStep === 0 && (
                <div className="text-center py-16 md:py-24 max-w-2xl mx-auto px-4">
                  <span className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs font-bold text-accent uppercase tracking-wider mb-6">
                    <Sparkles size={13} /> AI-Powered Nutrition Analysis
                  </span>
                  <h1 className="font-head font-black text-4xl md:text-6xl tracking-tight leading-tight mb-6">
                    Meet your personal <br />
                    <span className="text-accent">nutrition guardian</span>
                  </h1>
                  <p className="text-slate-400 text-base md:text-lg leading-relaxed mb-10">
                    Scan your plate with advanced machine learning. Get instant food item segmentations, micro & macro approximations, personalized optimization advice, and an intake regimen that automatically adapts based on your biweekly progres checks.
                  </p>
                  <button
                    onClick={() => handleOnboardingNext(1)}
                    className="bg-accent text-slate-950 font-bold px-8 py-4 rounded-2xl text-base tracking-wide hover:bg-emerald-400 hover:scale-[1.02] hover:shadow-2xl hover:shadow-emerald-500/20 active:scale-[0.98] transition-all duration-200"
                  >
                    Get Started Now →
                  </button>
                </div>
              )}

              {onboardingStep > 0 && (
                <div className="max-w-md mx-auto py-10">
                  {/* Step Indicators */}
                  <div className="flex items-center justify-center gap-4 mb-10">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                        onboardingStep >= 1
                          ? onboardingStep > 1
                            ? "bg-accent text-slate-950 border-accent"
                            : "bg-accent/10 text-accent border-accent"
                          : "bg-slate-900 text-slate-500 border-white/5"
                      }`}
                    >
                      {onboardingStep > 1 ? <Check size={14} /> : "1"}
                    </div>
                    <div className={`h-0.5 w-12 rounded-full ${onboardingStep > 1 ? "bg-accent" : "bg-white/5"}`} />
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                        onboardingStep >= 2
                          ? onboardingStep > 2
                            ? "bg-accent text-slate-950 border-accent"
                            : "bg-accent/10 text-accent border-accent"
                          : "bg-slate-900 text-slate-500 border-white/5"
                      }`}
                    >
                      {onboardingStep > 2 ? <Check size={14} /> : "2"}
                    </div>
                    <div className={`h-0.5 w-12 rounded-full ${onboardingStep > 2 ? "bg-accent" : "bg-white/5"}`} />
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                        onboardingStep >= 3
                          ? "bg-accent/10 text-accent border-accent"
                          : "bg-slate-900 text-slate-500 border-white/5"
                      }`}
                    >
                      "3"
                    </div>
                  </div>

                  {/* Step 1: Personal Info */}
                  {onboardingStep === 1 && (
                    <div className="bg-[#111827] border border-white/5 rounded-3xl p-8 shadow-xl">
                      <h2 className="font-head font-extrabold text-2xl tracking-tight text-white mb-2">About you</h2>
                      <p className="text-xs text-slate-400 mb-6">We'll use this to compute your dynamic energy expenditure targets.</p>

                      <div className="grid grid-cols-2 gap-4 mb-5">
                        <div className="flex flex-col text-left">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">First Name</label>
                          <input
                            type="text"
                            placeholder="Alex"
                            value={fName}
                            onChange={(e) => setFName(e.target.value)}
                            className="bg-[#1a2235] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-accent transition"
                          />
                        </div>
                        <div className="flex flex-col text-left">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Age</label>
                          <input
                            type="number"
                            placeholder="28"
                            min="10"
                            max="100"
                            value={fAge}
                            onChange={(e) => setFAge(e.target.value)}
                            className="bg-[#1a2235] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-accent transition"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col text-left mb-8">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Biological Sex</label>
                        <div className="flex gap-2">
                          {["male", "female", "other"].map((gender) => (
                            <button
                              key={gender}
                              onClick={() => setGenderSel(gender)}
                              className={`flex-1 py-2.5 rounded-full border text-xs font-semibold capitalize transition-all duration-200 ${
                                genderSel === gender
                                  ? "bg-accent/15 border-accent text-accent"
                                  : "bg-[#1a2235] border-white/10 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              {gender}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => handleOnboardingNext(2)}
                        className="w-full bg-accent text-slate-950 font-bold py-3.5 rounded-xl text-sm hover:bg-emerald-400 transition-all duration-200"
                      >
                        Continue →
                      </button>
                    </div>
                  )}

                  {/* Step 2: Body Metrics */}
                  {onboardingStep === 2 && (
                    <div className="bg-[#111827] border border-white/5 rounded-3xl p-8 shadow-xl">
                      <h2 className="font-head font-extrabold text-2xl tracking-tight text-white mb-2">Your measurements</h2>
                      <p className="text-xs text-slate-400 mb-6">Helps calculate your absolute base BMR and active daily needs.</p>

                      <div className="grid grid-cols-2 gap-4 mb-5">
                        <div className="flex flex-col text-left">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Weight (kg)</label>
                          <input
                            type="number"
                            placeholder="70"
                            min="30"
                            max="300"
                            value={fWeight}
                            onChange={(e) => setFWeight(e.target.value)}
                            className="bg-[#1a2235] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-accent transition"
                          />
                        </div>
                        <div className="flex flex-col text-left">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Height (cm)</label>
                          <input
                            type="number"
                            placeholder="175"
                            min="100"
                            max="250"
                            value={fHeight}
                            onChange={(e) => setFHeight(e.target.value)}
                            className="bg-[#1a2235] border border-white/10 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-accent transition"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col text-left mb-8">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Activity Level</label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { value: "sedentary", label: "Sedentary" },
                            { value: "light", label: "Light" },
                            { value: "moderate", label: "Moderate" },
                            { value: "active", label: "Active" },
                            { value: "very_active", label: "Very Active" },
                          ].map((act) => (
                            <button
                              key={act.value}
                              onClick={() => setActivitySel(act.value)}
                              className={`px-3.5 py-2 rounded-full border text-xs font-semibold transition-all ${
                                activitySel === act.value
                                  ? "bg-accent/15 border-accent text-accent"
                                  : "bg-[#1a2235] border-white/5 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => setOnboardingStep(1)}
                          className="px-5 bg-slate-800 border border-white/5 rounded-xl text-slate-300 text-xs font-bold hover:text-white hover:bg-slate-700 transition"
                        >
                          Back
                        </button>
                        <button
                          onClick={() => handleOnboardingNext(3)}
                          className="flex-1 bg-accent text-slate-950 font-bold py-3.5 rounded-xl text-sm hover:bg-emerald-400 transition"
                        >
                          Continue →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Goal Selection */}
                  {onboardingStep === 3 && (
                    <div className="bg-[#111827] border border-white/5 rounded-3xl p-8 shadow-xl">
                      <h2 className="font-head font-extrabold text-2xl tracking-tight text-white mb-2">Your fitness goal</h2>
                      <p className="text-xs text-slate-400 mb-6">PlateGuardian will tailor every recommendation and advice to this choice.</p>

                      <div className="flex flex-col gap-3 mb-8">
                        {[
                          { id: "lose", emoji: "🔥", title: "Lose Weight", desc: "Maintains a safe 500 kcal daily deficit" },
                          { id: "maintain", emoji: "⚖️", title: "Maintain Weight", desc: "Maintains balance at your exact TDEE" },
                          { id: "gain", emoji: "💪", title: "Gain Muscle", desc: "Constructs a targeted 300 kcal daily surplus" },
                        ].map((g) => (
                          <button
                            key={g.id}
                            onClick={() => setGoalSel(g.id)}
                            className={`flex items-start gap-4 p-4 rounded-2xl text-left border transition-all ${
                              goalSel === g.id
                                ? "bg-accent/10 border-accent"
                                : "bg-[#1a2235] border-white/5 hover:border-white/10"
                            }`}
                          >
                            <span className="text-2xl pt-1">{g.emoji}</span>
                            <div>
                              <h4 className="text-sm font-bold text-white leading-tight">{g.title}</h4>
                              <p className="text-xs text-slate-400 mt-1">{g.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => setOnboardingStep(2)}
                          className="px-5 bg-slate-800 border border-white/5 rounded-xl text-slate-300 text-xs font-bold hover:text-white hover:bg-slate-700 transition"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleCompleteOnboarding}
                          className="flex-1 bg-accent text-slate-950 font-bold py-3.5 rounded-xl text-sm hover:bg-emerald-400 shadow-lg shadow-emerald-500/10 transition"
                        >
                          Calculate My Plan 🚀
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════
               DASHBOARD SCREEN
             ═══════════════════════════════════════════════ */}
          {user && currentScreen === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full flex flex-col gap-8"
            >
              {/* Dash Hero Banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 pb-6 border-b border-white/5">
                <div>
                  <h1 className="font-head font-black text-3xl tracking-tight text-white">
                    Good day, {user.name} 👋
                  </h1>
                  <span className="text-xs font-semibold text-slate-400 mt-1.5 flex items-center gap-2">
                    <Calendar size={13} /> {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3.5 py-1 text-xs font-bold text-accent uppercase tracking-wider">
                    Goal: {user.goal === "lose" ? "Lose Weight" : user.goal === "gain" ? "Gain Muscle" : "Maintain Weight"}
                  </span>
                  <button
                    onClick={() => {
                      handleResetScan();
                      setCurrentScreen("scan");
                    }}
                    className="bg-accent text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 hover:bg-emerald-400 transition"
                  >
                    <Plus size={14} /> Scan Meal
                  </button>
                </div>
              </div>

              {/* Progress Summary Widgets */}
              <div className="flex flex-col gap-2.5">
                <h3 className="font-head text-[11px] uppercase tracking-widest font-black text-slate-500 flex items-center gap-2">
                  Today's Macros Progression
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Calories", val: consumedCalories, max: targetCal, unit: "kcal", color: "#f43f5e", bg: "bg-red-500/10", border: "border-red-500/20" },
                    { label: "Protein", val: Math.round(consumedProtein), max: targetP, unit: "g", color: "#38bdf8", bg: "bg-sky-500/10", border: "border-sky-500/20" },
                    { label: "Carbohydrates", val: Math.round(consumedCarbs), max: targetC, unit: "g", color: "#f59e0b", bg: "bg-amber-500/10", border: "border-amber-500/20" },
                    { label: "Fat", val: Math.round(consumedFat), max: targetF, unit: "g", color: "#a78bfa", bg: "bg-purple-500/10", border: "border-purple-500/20" },
                  ].map((stat) => {
                    const pct = Math.min(stat.val / stat.max, 1);
                    const circ = 2 * Math.PI * 26;
                    const strokeDash = pct * circ;

                    return (
                      <div
                        key={stat.label}
                        className={`bg-slate-900 border border-white/5 rounded-2xl p-5 text-center flex flex-col items-center justify-between relative overflow-hidden transition hover:border-white/10`}
                      >
                        {/* Circle */}
                        <div className="relative mb-3">
                          <svg width="68" height="68" viewBox="0 0 68 68">
                            <circle cx="34" cy="34" r="26" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="6" />
                            <circle
                              cx="34"
                              cy="34"
                              r="26"
                              fill="none"
                              stroke={stat.color}
                              strokeWidth="6"
                              strokeLinecap="round"
                              strokeDasharray={`${strokeDash.toFixed(1)} ${circ.toFixed(1)}`}
                              transform="rotate(-90 34 34)"
                              style={{ transition: "stroke-dashoffset 1s ease" }}
                            />
                          </svg>
                          <div
                            className="absolute inset-0 flex items-center justify-center font-head font-extrabold text-[13px]"
                            style={{ color: stat.color }}
                          >
                            {Math.round((stat.val / stat.max) * 100)}%
                          </div>
                        </div>

                        <div className="font-head text-2xl font-black text-white leading-tight">
                          {stat.val}
                          <span className="text-[11px] font-medium text-slate-500 ml-1 uppercase">{stat.unit}</span>
                        </div>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mt-2">{stat.label}</div>
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">Target: {stat.max}{stat.unit}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Main Content Splitted Section */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left side: Meal logs list */}
                <div className="lg:col-span-8 flex flex-col gap-4">
                  <h3 className="font-head text-[11px] uppercase tracking-widest font-black text-slate-500 flex items-center gap-2">
                    Meal Consumption Logs
                  </h3>

                  <div className="flex flex-col gap-3">
                    {todayMeals.length === 0 ? (
                      <div className="bg-[#111827] border border-white/5 rounded-2xl py-14 text-center px-6">
                        <span className="text-3xl inline-block mb-3">🍽️</span>
                        <h4 className="text-sm font-bold text-white mb-1">No meals logged for today yet</h4>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto mb-6">
                          Capture your plate photo and let the AI extract precise weights, calories, and balances.
                        </p>
                        <button
                          onClick={() => {
                            handleResetScan();
                            setCurrentScreen("scan");
                          }}
                          className="bg-transparent border border-accent hover:bg-accent/5 text-accent font-bold px-5 py-2.5 rounded-xl text-xs transition"
                        >
                          Scan Your First Meal
                        </button>
                      </div>
                    ) : (
                      todayMeals.map((m) => (
                        <div
                          key={m.id}
                          className="bg-[#111827] border border-white/5 hover:border-white/10 rounded-2xl p-4 flex items-center gap-4 transition-all hover:translate-x-1"
                        >
                          <div className="w-12 h-12 bg-slate-900 border border-white/5 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                            {m.emoji}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <h4 className="text-sm font-bold text-white truncate leading-snug">{m.name}</h4>
                            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mt-1">
                              {m.time} · {m.p}g Protein · {m.c}g Carbs
                            </span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="font-head text-lg font-black text-[#f43f5e]">{m.cal}</span>
                            <span className="text-[10px] font-semibold text-slate-500 block leading-none">kcal</span>
                            <span
                              className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                                m.score >= 75
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : m.score >= 50
                                  ? "bg-amber-500/10 text-amber-400"
                                  : "bg-rose-500/10 text-rose-400"
                              }`}
                            >
                              Score: {m.score}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right side: Sidebar metrics */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  {/* Calorie deficit card */}
                  <div className="bg-[#111827] border border-emerald-500/15 rounded-3xl p-6 shadow-xl relative overflow-hidden text-left bg-gradient-to-br from-[#111827] via-[#111827] to-[#00e5a0]/5">
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-2">
                      Remaining Budget
                    </span>
                    <h2 className="font-head font-black text-5xl text-accent leading-none">
                      {remainingCal}
                      <span className="text-xs font-semibold text-slate-400 ml-1.5 uppercase font-sans">kcal</span>
                    </h2>
                    <div className="h-0.5 w-full bg-white/5 my-5" />
                    <div className="flex items-center justify-between text-xs font-medium mb-2.5">
                      <span className="text-slate-400">Target Intake</span>
                      <span className="text-white font-bold">{targetCal} kcal</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-400">Total Consumed</span>
                      <span className="text-rose-400 font-bold">{consumedCalories} kcal</span>
                    </div>
                  </div>

                  {/* 14-day checkin card */}
                  <div className="bg-[#111827] border border-white/5 rounded-3xl p-6 text-left shadow-xl">
                    <div className="text-2xl mb-3">⚖️</div>
                    <h3 className="font-head font-bold text-base text-white">14-Day Check-in Progress</h3>
                    <p className="text-xs text-slate-400 mt-1 mb-5">
                      {daysUntilCheckin > 0
                        ? `Your current plan check-in becomes active in ${daysUntilCheckin} days.`
                        : "Your biweekly metabolic evaluation is active! Log weight to calibrate plans."}
                    </p>
                    <button
                      onClick={() => setCurrentScreen("checkin")}
                      className="w-full py-2.5 bg-slate-800 border border-white/5 rounded-xl text-slate-300 text-xs font-bold hover:bg-slate-700 hover:text-white transition"
                    >
                      Go to Check-in Panel
                    </button>
                  </div>

                  {/* Profile Targets summary */}
                  <div className="bg-[#111827] border border-white/5 rounded-3xl p-6 text-left shadow-xl">
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-4">
                      My Physical Metrics
                    </span>
                    <div className="flex flex-col gap-3">
                      {[
                        { label: "BMR Baseline", val: `${user.bmr} kcal/day` },
                        { label: "Calculated TDEE", val: `${user.tdee} kcal/day` },
                        { label: "Current Weight", val: `${user.weight} kg` },
                        { label: "Height", val: `${user.height} cm` },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 font-medium">{item.label}</span>
                          <span className="text-white font-bold">{item.val}</span>
                        </div>
                      ))}
                    </div>

                    <div className="h-0.5 w-full bg-white/5 my-4" />
                    <button
                      onClick={handleResetApp}
                      className="text-[10px] font-bold text-rose-400/80 hover:text-rose-400 flex items-center gap-1 hover:underline ml-auto"
                    >
                      <RotateCcw size={10} /> Reset Profile Data
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════
               SCAN MEAL SCREEN
             ═══════════════════════════════════════════════ */}
          {user && currentScreen === "scan" && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left side: Upload card or image visualization */}
                <div className="lg:col-span-6 flex flex-col gap-4 text-left">
                  <h3 className="font-head text-[11px] uppercase tracking-widest font-black text-slate-500">
                    Meal Scanner
                  </h3>

                  {/* Upload Drop Zone */}
                  {!image && (
                    <div
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-white/10 hover:border-accent rounded-3xl p-12 text-center cursor-pointer bg-slate-900/50 hover:bg-accent/5 transition-all group"
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <div className="w-14 h-14 bg-accent/10 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 group-hover:scale-110 transition">
                        📷
                      </div>
                      <h4 className="text-base font-bold text-white mb-1">Drop your meal photo here</h4>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto">
                        or click to browse from device (supports JPEGs, PNGs, and WEBP).
                      </p>
                    </div>
                  )}

                  {/* Image with bounding boxes */}
                  {image && (
                    <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-slate-900 flex flex-col items-center">
                      <img src={image} className="w-full max-h-[380px] object-cover block" alt="Meal Upload" />

                      {/* Scanning sweeping effect */}
                      {isDetecting && (
                        <div className="absolute inset-0 bg-[#0a0e17]/85 backdrop-blur-[3px] flex flex-col items-center justify-center gap-4">
                          <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent animate-scan" />
                          <div className="w-10 h-10 border-3 border-white/5 border-t-accent rounded-full animate-spin" />
                          <div className="text-center">
                            <h4 className="text-sm font-bold text-accent">Analyzing Plate Components...</h4>
                            <p className="text-[11px] text-slate-400 mt-1">Estimating portion volumes using Gemini API</p>
                          </div>
                        </div>
                      )}

                      {/* Bounding box layer */}
                      {!isDetecting && detections.length > 0 && (
                        <div className="absolute inset-0 pointer-events-none">
                          {detections.map((d, index) => (
                            <div
                              key={index}
                              className="absolute border-2 rounded-lg"
                              style={{
                                left: `${d.x * 100}%`,
                                top: `${d.y * 100}%`,
                                width: `${d.w * 100}%`,
                                height: `${d.h * 100}%`,
                                borderColor: d.color,
                              }}
                            >
                              <div
                                className="absolute -top-6 left-0 px-2.5 py-0.5 rounded-md text-[10px] font-bold text-slate-950 font-sans shadow-lg"
                                style={{ backgroundColor: d.color }}
                              >
                                {d.label} {Math.round(d.conf * 100)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Detected chips summary */}
                  {image && !isDetecting && detections.length > 0 && (
                    <div className="bg-slate-900 border border-white/5 rounded-2xl p-4 mt-2">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 block mb-2.5">
                        Identified Components
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {detections.map((d, i) => (
                          <span
                            key={i}
                            className="text-xs px-3 py-1 rounded-full border flex items-center gap-1.5"
                            style={{
                              backgroundColor: `${d.color}15`,
                              borderColor: `${d.color}30`,
                              color: d.color,
                            }}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                            {d.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {image && (
                    <button
                      onClick={handleResetScan}
                      className="w-full py-2.5 bg-slate-800 border border-white/5 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold mt-2 transition"
                    >
                      ↺ &nbsp;Scan different meal
                    </button>
                  )}
                </div>

                {/* Right side: Questions, Calculators and Results */}
                <div className="lg:col-span-6 flex flex-col gap-4 text-left">
                  {/* Empty state */}
                  {!image && (
                    <div className="bg-[#111827] border border-white/5 rounded-3xl p-10 text-center shadow-xl">
                      <span className="text-4xl inline-block mb-3">🍽️</span>
                      <h3 className="font-head font-bold text-lg text-white mb-2">Upload your plate photo</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Our integrated vision intelligence will locate each food item on your plate and request some minor clarification questions to generate high-fidelity macronutrient estimates.
                      </p>
                    </div>
                  )}

                  {/* Questions flow */}
                  {image && !currentNutrition && !isCalculating && (
                    <div className="bg-[#111827] border border-white/5 rounded-3xl p-6 shadow-xl">
                      <div className="pb-4 border-b border-white/5 mb-5">
                        <h3 className="font-head font-extrabold text-lg text-white">Refining Questions</h3>
                        <p className="text-xs text-slate-400 mt-1">Clarify the prep method below to lock in maximum calculation precision.</p>
                      </div>

                      {questions.length === 0 && !isDetecting ? (
                        <div className="py-6 text-center text-slate-500 text-xs">No questions returned. Adjust or check API keys.</div>
                      ) : (
                        <div className="flex flex-col gap-5">
                          {questions.map((item) => (
                            <div key={item.q} className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                                <Info size={12} className="text-accent" /> {item.q}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {item.opts.map((opt) => (
                                  <button
                                    key={opt}
                                    onClick={() => handleSelectChip(item.q, opt)}
                                    className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all ${
                                      chipAnswers[item.q] === opt
                                        ? "bg-accent/15 border-accent text-accent font-semibold"
                                        : "bg-slate-900 border-white/5 text-slate-400 hover:text-slate-200"
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={triggerNutritionCalculation}
                        disabled={!allQuestionsAnswered() || isDetecting}
                        className="w-full bg-accent text-slate-950 font-bold py-3.5 rounded-xl text-xs tracking-wider uppercase mt-8 hover:bg-emerald-400 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
                      >
                        Calculate Nutrition →
                      </button>
                    </div>
                  )}

                  {/* Loading calculations spinner */}
                  {isCalculating && (
                    <div className="bg-[#111827] border border-white/5 rounded-3xl p-12 text-center shadow-xl">
                      <div className="w-10 h-10 border-3 border-white/5 border-t-accent rounded-full animate-spin mx-auto mb-4" />
                      <h4 className="text-sm font-bold text-white mb-1">Calculating nutrients...</h4>
                      <p className="text-xs text-slate-400">Prompting Gemini to structure complete macro allocations</p>
                    </div>
                  )}

                  {/* Results Panel */}
                  {currentNutrition && (
                    <div className="flex flex-col gap-6">
                      {/* Breakdown Table */}
                      <div className="bg-[#111827] border border-white/5 rounded-3xl p-6 shadow-xl">
                        <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-4">
                          Portion Nutrient Decomposition
                        </span>
                        <div className="overflow-x-auto">
                          <table className="nutrition-table text-left">
                            <thead>
                              <tr>
                                <th>Food</th>
                                <th>Serving</th>
                                <th className="text-red-400">Cal</th>
                                <th className="text-sky-400">Prot</th>
                                <th className="text-amber-400">Carbs</th>
                                <th className="text-purple-400">Fat</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentNutrition.items.map((item, i) => (
                                <tr key={i}>
                                  <td className="font-bold flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                    {item.name}
                                  </td>
                                  <td className="text-slate-400 text-xs font-medium">{item.g}g</td>
                                  <td className="text-red-400 font-bold">{item.cal}</td>
                                  <td className="font-semibold text-slate-200">{item.p}g</td>
                                  <td className="font-semibold text-slate-200">{item.c}g</td>
                                  <td className="font-semibold text-slate-200">{item.f}g</td>
                                </tr>
                              ))}
                              {/* Total Row */}
                              <tr className="border-t-2 border-white/10 font-bold">
                                <td colSpan={2} className="text-white pt-3">Total Accumulation</td>
                                <td className="text-red-400 font-extrabold text-base pt-3">
                                  {currentNutrition.items.reduce((sum, item) => sum + item.cal, 0)}
                                </td>
                                <td className="text-white pt-3">
                                  {Math.round(currentNutrition.items.reduce((sum, item) => sum + item.p, 0) * 10) / 10}g
                                </td>
                                <td className="text-white pt-3">
                                  {Math.round(currentNutrition.items.reduce((sum, item) => sum + item.c, 0) * 10) / 10}g
                                </td>
                                <td className="text-white pt-3">
                                  {Math.round(currentNutrition.items.reduce((sum, item) => sum + item.f, 0) * 10) / 10}g
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Balanced Plate Score */}
                      <div className="bg-[#111827] border border-white/5 rounded-3xl p-6 shadow-xl">
                        <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-4">
                          Balanced Plate Score Evaluation
                        </span>

                        <div className="flex flex-col sm:flex-row items-center gap-6">
                          <div className="relative flex-shrink-0">
                            <svg width="120" height="120" viewBox="0 0 120 120">
                              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="10" />
                              <circle
                                cx="60"
                                cy="60"
                                r="50"
                                fill="none"
                                stroke={currentNutrition.plateScore >= 75 ? "#00e5a0" : currentNutrition.plateScore >= 50 ? "#f59e0b" : "#f43f5e"}
                                strokeWidth="10"
                                strokeLinecap="round"
                                strokeDasharray={`${((currentNutrition.plateScore / 100) * (2 * Math.PI * 50)).toFixed(1)} ${(2 * Math.PI * 50).toFixed(1)}`}
                                transform="rotate(-90 60 60)"
                                style={{ transition: "stroke-dashoffset 1s ease" }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="font-head font-black text-3xl leading-none">{currentNutrition.plateScore}</span>
                              <span className="text-[10px] text-slate-500 font-bold mt-0.5 uppercase tracking-wider">/100</span>
                            </div>
                          </div>

                          <div className="text-left flex-1">
                            <h4 className="font-head font-extrabold text-base text-white">Macro Balanced Quotient</h4>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                              Computed against the classic 2:1:1 rule index, supporting ½ green vegetables, ¼ high-yield lean proteins, and ¼ nutrient-dense complex starches.
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {currentNutrition.plateScore >= 75 ? (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                  ✓ Outstanding Balance
                                </span>
                              ) : (
                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/25 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                  ⚠️ Nutritional Gaps Observed
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* AI Suggestion Card */}
                      <div className="bg-gradient-to-r from-accent/10 to-sky-500/10 border border-accent/20 rounded-3xl p-6 text-left shadow-lg relative overflow-hidden">
                        <span className="text-[10px] uppercase font-black tracking-widest text-accent block mb-2.5">
                          ✦ Personalized AI Calibrations
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed font-medium">
                          "{currentNutrition.suggestion}"
                        </p>
                      </div>

                      {/* Save to Dashboard Button */}
                      <button
                        onClick={handleSaveMeal}
                        className="w-full bg-accent text-slate-950 font-bold py-4 rounded-2xl text-xs tracking-wider uppercase hover:bg-emerald-400 shadow-xl shadow-emerald-500/15 transition-all"
                      >
                        ✓ Save Meal to Log & Dashboard
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════
               14-DAY PROGRESSIVE CHECK-IN
             ═══════════════════════════════════════════════ */}
          {user && currentScreen === "checkin" && (
            <motion.div
              key="checkin"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full max-w-2xl mx-auto flex flex-col gap-6"
            >
              {/* Header */}
              <div className="text-left mb-4">
                <h1 className="font-head font-black text-3xl tracking-tight text-white mb-2 flex items-center gap-2">
                  <Award className="text-accent" /> Progressive check-in
                </h1>
                <p className="text-xs text-slate-400">
                  Your daily nutrient target adjusts dynamically every 14 days based on actual bio-metric weight patterns to maintain healthy progression.
                </p>
              </div>

              {/* Day Tracker Ring */}
              <div className="bg-[#111827] border border-white/5 rounded-3xl p-8 flex flex-col sm:flex-row items-center justify-center gap-8 shadow-xl">
                <div className="relative">
                  <svg width="150" height="150" viewBox="0 0 150 150">
                    <circle cx="75" cy="75" r="62" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="8" />
                    <circle
                      cx="75"
                      cy="75"
                      r="62"
                      fill="none"
                      stroke="#00e5a0"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${((checkinDaysProgress / 14) * (2 * Math.PI * 62)).toFixed(1)} ${(2 * Math.PI * 62).toFixed(1)}`}
                      transform="rotate(-90 75 75)"
                      style={{ transition: "stroke-dashoffset 1s ease" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-head font-black text-4xl leading-none">{checkinDaysProgress}</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">/ 14 Days</span>
                  </div>
                </div>

                <div className="text-left flex-1">
                  <span className="bg-accent/15 text-accent border border-accent/25 rounded-full px-3.5 py-0.5 text-[10px] font-bold uppercase tracking-wider inline-block mb-3">
                    {daysUntilCheckin === 0 ? "⚡ Weigh-In Calibration Ready" : "On Track"}
                  </span>
                  <h4 className="font-head font-extrabold text-lg text-white leading-tight">Metabolic Calibration Cycle</h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {daysUntilCheckin > 0
                      ? `We are logging biometric weights. In ${daysUntilCheckin} days, our analysis will compare target progression with actual measurements.`
                      : "The calibration window is open. Record your current weight to evaluate and adjust targets."}
                  </p>
                </div>
              </div>

              {/* Log current weight */}
              <div className="bg-[#111827] border border-white/5 rounded-3xl p-6 text-left shadow-xl">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-4">
                  Log Current Weigh-in
                </span>
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      placeholder="e.g. 77.5"
                      value={ciWeight}
                      onChange={(e) => setCiWeight(e.target.value)}
                      className="w-full bg-[#1a2235] border border-white/10 rounded-xl pl-10 pr-12 py-3.5 text-slate-200 text-sm focus:outline-none focus:border-accent transition"
                    />
                    <Scale className="absolute left-3.5 top-4 text-slate-500" size={16} />
                    <span className="absolute right-4 top-4 text-slate-400 text-xs font-bold font-mono">KG</span>
                  </div>
                  <button
                    onClick={handleSubmitCheckin}
                    className="bg-accent text-slate-950 font-bold px-6 rounded-xl text-xs tracking-wider uppercase hover:bg-emerald-400 transition"
                  >
                    Submit Check-in
                  </button>
                </div>
              </div>

              {/* Calibration outcome notification */}
              {checkInResult && (
                <div className="bg-slate-900 border border-accent/20 rounded-3xl p-6 text-left shadow-xl bg-gradient-to-br from-slate-900 via-slate-900 to-accent/5">
                  <div className="text-3xl mb-2">🎯</div>
                  <h4 className="font-head font-bold text-accent text-base mb-1">Weigh-in calibration complete</h4>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4">"{checkInResult.message}"</p>
                  <div className="grid grid-cols-2 gap-4 bg-[#1a2235]/40 border border-white/5 rounded-2xl p-4">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">New Intake Target</span>
                      <span className="font-head font-black text-2xl text-white">{checkInResult.newTarget} <span className="text-[10px] uppercase text-slate-500">kcal/day</span></span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Active Goal Alignment</span>
                      <span className="font-head font-black text-base text-accent capitalize">{user.goal}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Progression Log history */}
              <div className="bg-[#111827] border border-white/5 rounded-3xl p-6 text-left shadow-xl">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-5">
                  Check-in Progression Timeline
                </span>

                <div className="timeline">
                  {checkins.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4">
                      No progressive check-ins captured yet. Logging your first weigh-in above will begin the tracking timeline.
                    </div>
                  ) : (
                    checkins.map((ci, idx) => (
                      <div key={idx} className="timeline-item text-left">
                        <div className="timeline-dot done" />
                        <h4 className="text-xs font-bold text-white">{ci.date}</h4>
                        <div className="text-xs font-bold text-slate-300 mt-1 flex items-center gap-1.5">
                          {ci.weight} kg
                          {ci.delta !== null && (
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${ci.delta <= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                              {ci.delta > 0 ? "+" : ""}
                              {ci.delta} kg change
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">"{ci.message}"</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
