import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Trash2, Calculator, Settings, FileText, Zap, ChevronRight, ChevronDown, 
  Info, Book, Save, X, Download, FileSpreadsheet, FolderUp, FolderDown 
} from 'lucide-react';
import { LoadItem, LoadType, ProjectConfig, CalculationResult, InputMode, LibraryItem } from './types';
import { EXAMPLE_LOADS, DEFAULT_LIBRARY } from './data/tables';
import { performSystemCalculation, getRowRecommendation, calculateRowActivePower, getItemEquivalentKw, getEffectiveVoltage } from './services/calculator';

export default function App() {
  // --- 状态管理 ---
  const [loads, setLoads] = useState<LoadItem[]>(() => {
    // 尝试把 string 类型的 type 转换为 enum
    return EXAMPLE_LOADS.map(l => ({
      ...l, 
      type: l.type, // 保持 string 类型
      inputMode: (l as any).inputMode || InputMode.KW, // 兼容旧数据
      ratedAmps: (l as any).ratedAmps || 0,
      useSystemVoltage: (l as any).useSystemVoltage ?? true, // 默认为true
    }));
  });
  
  const [config, setConfig] = useState<ProjectConfig>({
    systemVoltage: 380,
    marginFactor: 1.2,
    cableSafetyFactor: 1.25,
    defaultCosPhi: 0.8
  });

  const [result, setResult] = useState<CalculationResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // 文件上传 input 引用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 负载库状态 ---
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  
  // 初始化自定义库：包含数据清洗、去重和ID修复逻辑
  const [customLibrary, setCustomLibrary] = useState<LibraryItem[]>(() => {
    try {
      const saved = localStorage.getItem('elecMaster_library');
      let initialData: any[] = [];
      
      if (saved) {
        initialData = JSON.parse(saved);
      } else {
        // 如果本地没有任何数据，初始化时导入默认库，方便用户上手
        // 这样用户可以编辑和删除默认库，实现了"统一库"的需求
        initialData = JSON.parse(JSON.stringify(DEFAULT_LIBRARY));
      }
      
      // --- 数据清洗核心逻辑 ---
      const map = new Map<string, any>();
      
      initialData.forEach(item => {
         if (!item || !item.name) return;
         // 以名称为 Key 进行去重，保留列表中的最后一个（假设是新的）
         map.set(item.name, item);
      });

      const cleanData: LibraryItem[] = [];
      // 重新生成 ID，确保绝对唯一，修复无法删除的问题
      Array.from(map.values()).forEach((item, index) => {
         cleanData.push({
           ...item,
           libId: `lib-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`
         });
      });

      return cleanData;
    } catch (e) {
      console.error("Failed to load library", e);
      return [];
    }
  });

  // --- 实时计算 ---
  useEffect(() => {
    const res = performSystemCalculation(loads, config);
    setResult(res);
  }, [loads, config]);

  // --- 库持久化 ---
  useEffect(() => {
    localStorage.setItem('elecMaster_library', JSON.stringify(customLibrary));
  }, [customLibrary]);

  // --- 库分组逻辑 (Memoized) ---
  const groupedLibrary = useMemo(() => {
    const groups: Record<string, LibraryItem[]> = {};
    
    // 获取标准类型列表
    const standardOrder = Object.values(LoadType) as string[];

    // 遍历库项目进行动态分组
    customLibrary.forEach(item => {
      const t = item.type || '未分类';
      if (!groups[t]) {
        groups[t] = [];
      }
      groups[t].push(item);
    });

    // 结果排序：标准类型优先，其他类型按字母顺序
    const result: Record<string, LibraryItem[]> = {};
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const idxA = standardOrder.indexOf(a);
      const idxB = standardOrder.indexOf(b);
      // 都在标准列表中，按标准顺序
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      // 一个在标准列表，优先
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      // 都不在，按字母
      return a.localeCompare(b, 'zh-CN');
    });

    sortedKeys.forEach(key => {
      if (groups[key].length > 0) {
        result[key] = groups[key];
      }
    });
    
    return result;
  }, [customLibrary]);

  // --- 事件处理 ---
  const addLoad = () => {
    const newId = Date.now().toString();
    const newItem: LoadItem = {
      id: newId,
      name: '新负载',
      type: LoadType.MOTOR,
      inputMode: InputMode.KW,
      powerKw: 0.75,
      ratedAmps: 0,
      useSystemVoltage: true,
      voltage: 380,
      quantity: 1,
      kx: 1.0,
      cosPhi: 0.8,
      uses24V: false,
      current24V: 0
    };
    setLoads([...loads, newItem]);
    setExpandedId(newId); // 自动展开新添加的项
  };

  const removeLoad = (id: string) => {
    setLoads(loads.filter(l => l.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const updateLoad = (id: string, field: keyof LoadItem, value: any) => {
    setLoads(loads.map(l => {
      if (l.id === id) {
        return { ...l, [field]: value };
      }
      return l;
    }));
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // 库操作：保存
  const saveToLibrary = (item: LoadItem) => {
    // 检查重名
    const isDuplicate = customLibrary.some(l => l.name === item.name);
    
    if (isDuplicate) {
      const confirmOverwrite = window.confirm(`库中已存在名为 "${item.name}" 的设备。\n\n是否覆盖更新？(将删除所有同名旧数据)`);
      if (!confirmOverwrite) return;
      
      // 过滤掉所有同名的旧数据 (彻底去重)
      const cleanLib = customLibrary.filter(l => l.name !== item.name);
      
      // 生成新项
      const newItem: LibraryItem = {
        name: item.name,
        type: item.type,
        inputMode: item.inputMode,
        powerKw: item.powerKw,
        ratedAmps: item.ratedAmps,
        useSystemVoltage: item.useSystemVoltage,
        voltage: item.voltage,
        kx: item.kx,
        cosPhi: item.cosPhi,
        uses24V: item.uses24V,
        current24V: item.current24V,
        libId: `lib-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
      };

      setCustomLibrary([...cleanLib, newItem]);
    } else {
      // 新增
      const newItem: LibraryItem = {
        name: item.name,
        type: item.type,
        inputMode: item.inputMode,
        powerKw: item.powerKw,
        ratedAmps: item.ratedAmps,
        useSystemVoltage: item.useSystemVoltage,
        voltage: item.voltage,
        kx: item.kx,
        cosPhi: item.cosPhi,
        uses24V: item.uses24V,
        current24V: item.current24V,
        libId: `lib-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
      };
      setCustomLibrary([...customLibrary, newItem]);
    }
  };

  // 库操作：导入
  const importFromLibrary = (libItem: LibraryItem) => {
    const newId = Date.now().toString();
    // 显式解构赋值，防止将 libId 混入 LoadItem
    const newItem: LoadItem = {
      id: newId,
      name: libItem.name,
      type: libItem.type,
      inputMode: libItem.inputMode,
      powerKw: libItem.powerKw,
      ratedAmps: libItem.ratedAmps,
      useSystemVoltage: libItem.useSystemVoltage,
      voltage: libItem.voltage,
      kx: libItem.kx,
      cosPhi: libItem.cosPhi,
      uses24V: libItem.uses24V,
      current24V: libItem.current24V,
      quantity: 1, // 默认数量1
    };
    
    setLoads([...loads, newItem]);
    setIsLibraryOpen(false);
    setExpandedId(newId);
  };

  // 库操作：删除
  const deleteFromLibrary = (libId: string) => {
    if (!libId) return;
    setCustomLibrary(prevLib => prevLib.filter(item => item.libId !== libId));
  };

  // --- 文件管理功能 ---

  // 导出 CSV (Excel)
  const exportToCSV = () => {
    if (!result) return;

    // CSV BOM for Excel to read UTF-8 correctly
    const BOM = '\uFEFF'; 
    let csvContent = BOM + "名称,类型,电压(V),功率/电流输入,数量,系数Kx,Cosφ,计入功率(kW),选型参考\n";

    loads.forEach(item => {
      const effectiveVoltage = getEffectiveVoltage(item, config.systemVoltage);
      const activeKw = calculateRowActivePower(item, config.systemVoltage);
      const inputVal = item.inputMode === InputMode.KW ? `${item.powerKw} kW` : `${item.ratedAmps} A`;
      const rec = getRowRecommendation(item, config.systemVoltage).replace(/,/g, ' '); // 移除逗号防止CSV错位

      csvContent += `${item.name},${item.type},${effectiveVoltage},${inputVal},${item.quantity},${item.kx},${item.cosPhi},${activeKw.toFixed(2)},${rec}\n`;
    });

    csvContent += `\n,,,,,,\n`;
    csvContent += `汇总,,,,,,\n`;
    csvContent += `总有功功率 (kW),${result.totalActivePower},,,,,,\n`;
    csvContent += `进线电流 (A),${result.mainCurrent},,,,,,\n`;
    csvContent += `推荐主空开,${result.mainBreaker},,,,,,\n`;
    csvContent += `推荐主电缆,${result.mainCable},,,,,,\n`;
    csvContent += `DC24V总需求,${result.dc24v.recommendedCurrent} A (${result.dc24v.description}),,,,,\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `配电计算书_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 保存项目 (JSON)
  const saveProject = () => {
    const projectData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      config,
      loads
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Project_${new Date().toLocaleDateString()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 打开项目 (JSON)
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (data.config && data.loads) {
          if (window.confirm("确定要导入该项目吗？当前未保存的修改将丢失。")) {
            setConfig(data.config);
            setLoads(data.loads);
          }
        } else {
          alert("无效的项目文件格式");
        }
      } catch (err) {
        alert("文件解析失败");
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // 生成铭牌文本
  const nameplateText = useMemo(() => {
    if (!result) return '';
    return `设备名称：[填写设备名]
额定电压：AC${config.systemVoltage}V / 50Hz
总功率：${result.totalActivePower.toFixed(2)} KW
满载电流：${result.mainCurrent} A
控制电压：DC24V
制造日期：${new Date().toLocaleDateString()}
`;
  }, [result, config.systemVoltage]);

  // 渲染计算公式详情
  const renderFormulaDetails = (item: LoadItem) => {
    const effectiveVoltage = getEffectiveVoltage(item, config.systemVoltage);
    const eqKw = getItemEquivalentKw(item, config.systemVoltage);
    const activeKw = calculateRowActivePower(item, config.systemVoltage);
    const is380 = effectiveVoltage >= 300; // 简单判断是否三相
    const root3 = is380 ? 1.732 : 1;
    
    // --- 新增：计算额定电流 (用于显示) ---
    const cos = item.cosPhi || 0.8;
    let calculatedAmps = 0;
    let currentFormula = '';

    if (item.inputMode === InputMode.KW) {
      // I = P * 1000 / (U * root3 * cos)
      calculatedAmps = (item.powerKw * 1000) / (effectiveVoltage * root3 * cos);
      currentFormula = is380 
        ? `${item.powerKw}kW × 1000 / (1.732 × ${effectiveVoltage}V × ${cos}) ≈ ${calculatedAmps.toFixed(2)} A`
        : `${item.powerKw}kW × 1000 / (${effectiveVoltage}V × ${cos}) ≈ ${calculatedAmps.toFixed(2)} A`;
    } else {
      calculatedAmps = item.ratedAmps;
      currentFormula = `直接录入: ${item.ratedAmps} A`;
    }
    // ------------------------------------

    // 步骤1：单机功率来源
    let step1 = '';
    let step1Title = '';
    if (item.inputMode === InputMode.KW) {
       step1Title = '单机功率';
       step1 = `直接录入: ${item.powerKw} kW`;
    } else {
       step1Title = '电流反推功率';
       if (is380) {
          step1 = `${item.ratedAmps}A × ${effectiveVoltage}V × √3 × ${item.cosPhi}(cosφ) / 1000 = ${eqKw.toFixed(3)} kW`;
       } else {
          step1 = `${item.ratedAmps}A × ${effectiveVoltage}V × ${item.cosPhi}(cosφ) / 1000 = ${eqKw.toFixed(3)} kW`;
       }
    }

    // 步骤2：计入功率
    const step2 = `${eqKw.toFixed(3)} kW × ${item.quantity}(数量) × ${item.kx}(系数Kx) = ${activeKw.toFixed(2)} kW`;

    // 步骤3：选型参考依据
    let step3 = '';
    const voltageDesc = item.useSystemVoltage ? `系统电压(${effectiveVoltage}V)` : `自定义电压(${effectiveVoltage}V)`;

    if (item.type === LoadType.MOTOR) {
       step3 = `电机类负载 [${voltageDesc}]：按 AC-3 负荷特性查表。估算电流约 ${calculatedAmps.toFixed(1)}A，建议接触器规格应大于此值。`;
    } else if (item.type === LoadType.HEATER) {
       step3 = `纯电阻负载 [${voltageDesc}]：AC-1。计算电流 ${calculatedAmps.toFixed(1)}A。`;
    } else {
       step3 = `普通负载 [${voltageDesc}]：根据额定电流选择对应空开。`;
    }

    return (
       <div className="bg-slate-50 p-4 border-t border-b border-blue-100 text-xs font-mono text-slate-600 grid gap-2 shadow-inner">
          <div className="flex gap-2">
            <span className="font-bold text-blue-600 min-w-[80px]">电压依据:</span>
            <span>{item.useSystemVoltage ? `☑ 跟随系统 (${config.systemVoltage}V)` : `☐ 自定义 (${item.voltage}V)`}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-blue-600 min-w-[80px]">Step 1:</span>
            <div className="flex flex-col gap-1">
               <span>{step1Title} → {step1}</span>
               {/* 新增的电流计算行 */}
               <span className="text-slate-600 bg-blue-50/50 px-2 py-0.5 rounded border border-blue-100 inline-block w-fit">
                  <span className="font-bold text-blue-600 mr-1">额定电流:</span>
                  {currentFormula}
               </span>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-blue-600 min-w-[80px]">Step 2:</span>
            <span>计入功率 → {step2}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-blue-600 min-w-[80px]">Note:</span>
            <span className="text-slate-500">{step3}</span>
          </div>
       </div>
    );
  };

  // --- 界面渲染 ---
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-800">
      
      {/* 顶部标题栏 + 工程管理按钮 */}
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-lg text-white shadow-lg">
            <Zap size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">配电选型助手 <span className="text-sm font-normal text-slate-500 bg-slate-200 px-2 py-1 rounded ml-2">Pro</span></h1>
            <p className="text-slate-500 text-sm">电气工程师的轻量级计算工具 - 自动计算功率、电流与电缆</p>
          </div>
        </div>

        {/* 工程文件操作区 */}
        <div className="flex gap-2 flex-wrap">
           <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileImport}
              className="hidden"
              accept=".json"
           />
           <button 
             onClick={() => fileInputRef.current?.click()}
             className="flex items-center gap-1.5 bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors shadow-sm"
             title="打开保存的项目文件"
           >
             <FolderUp size={16} /> 打开
           </button>
           <button 
             onClick={saveProject}
             className="flex items-center gap-1.5 bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors shadow-sm"
             title="保存当前项目到本地"
           >
             <FolderDown size={16} /> 保存
           </button>
           <button 
             onClick={exportToCSV}
             className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm font-medium transition-colors shadow-sm"
             title="导出 Excel (CSV) 计算书"
           >
             <FileSpreadsheet size={16} /> 导出表格
           </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 左侧：数据录入区 (占8列) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* 全局设置卡片 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4 text-slate-700 font-semibold border-b pb-2">
              <Settings size={18} />
              <h2>项目参数设置</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">系统电压 (V)</label>
                <select 
                  className="w-full border rounded p-2 text-sm bg-slate-50"
                  value={config.systemVoltage}
                  onChange={(e) => setConfig({...config, systemVoltage: Number(e.target.value)})}
                >
                  <option value={380}>380V (三相)</option>
                  <option value={220}>220V (单相)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">总功率裕量 (Margin)</label>
                <input 
                  type="number" step="0.1" 
                  className="w-full border rounded p-2 text-sm"
                  value={config.marginFactor}
                  onChange={(e) => setConfig({...config, marginFactor: parseFloat(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">电缆安全系数</label>
                <input 
                  type="number" step="0.05" 
                  className="w-full border rounded p-2 text-sm"
                  value={config.cableSafetyFactor}
                  onChange={(e) => setConfig({...config, cableSafetyFactor: parseFloat(e.target.value)})}
                />
              </div>
            </div>
          </div>

          {/* 负载列表卡片 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 overflow-hidden">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <Calculator size={18} />
                <h2>负载清单</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsLibraryOpen(true)}
                  className="flex items-center gap-1 bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-50 text-sm transition-colors shadow-sm"
                >
                  <Book size={16} /> 负载库
                </button>
                <button 
                  onClick={addLoad}
                  className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 text-sm transition-colors shadow-sm"
                >
                  <Plus size={16} /> 添加负载
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse min-w-[800px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3 min-w-[120px]">名称</th>
                    <th className="p-3 w-32">类型</th>
                    <th className="p-3 w-[120px]">电压 (V)</th>
                    <th className="p-3 w-[140px]">
                      功率/电流输入
                      <div className="text-[10px] font-normal text-slate-400">切换 KW / A</div>
                    </th>
                    <th className="p-3 w-16">数量</th>
                    <th className="p-3 min-w-[140px]">选型参考</th>
                    <th className="p-3 w-16">系数Kx</th>
                    <th className="p-3 w-16">Cosφ</th>
                    <th className="p-3 w-20">24V电流</th>
                    <th className="p-3 w-20 text-right">计入KW</th>
                    <th className="p-3 w-20 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loads.map((item, index) => (
                    <React.Fragment key={item.id}>
                      <tr className={`hover:bg-slate-50 group transition-colors ${expandedId === item.id ? 'bg-blue-50/30' : ''}`}>
                        <td className="p-3 text-center cursor-pointer" onClick={() => toggleExpand(item.id)}>
                          <div className="flex justify-center items-center text-slate-400 hover:text-blue-500">
                             {expandedId === item.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </td>
                        <td className="p-3">
                          <input 
                            type="text" 
                            className="w-full bg-transparent border-b border-transparent focus:border-blue-300 outline-none"
                            value={item.name}
                            onChange={(e) => updateLoad(item.id, 'name', e.target.value)}
                          />
                        </td>
                        <td className="p-3">
                          {(() => {
                            const standardTypes = Object.values(LoadType) as string[];
                            const isCustom = !standardTypes.includes(item.type);
                            
                            if (isCustom) {
                               return (
                                 <div className="flex items-center relative">
                                    <input 
                                      type="text"
                                      className="w-full bg-white border-b-2 border-blue-400 text-blue-700 outline-none text-sm px-1 py-1 pr-6"
                                      value={item.type}
                                      placeholder="输入类型"
                                      onChange={(e) => updateLoad(item.id, 'type', e.target.value)}
                                    />
                                    <button 
                                      onClick={() => updateLoad(item.id, 'type', LoadType.MOTOR)}
                                      className="absolute right-0 text-slate-400 hover:text-red-500 p-1"
                                      title="恢复选择模式"
                                    >
                                      <X size={14} />
                                    </button>
                                 </div>
                               );
                            }
                            
                            return (
                              <select 
                                className="w-full bg-transparent outline-none cursor-pointer hover:text-blue-600 transition-colors"
                                value={item.type}
                                onChange={(e) => {
                                  if (e.target.value === 'CUSTOM_INPUT_TRIGGER') {
                                    updateLoad(item.id, 'type', ''); // 清空以触发输入框
                                  } else {
                                    updateLoad(item.id, 'type', e.target.value);
                                  }
                                }}
                              >
                                {standardTypes.map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                                <option value="CUSTOM_INPUT_TRIGGER" className="text-blue-600 font-semibold bg-blue-50">+ 自定义...</option>
                              </select>
                            );
                          })()}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer select-none">
                              <input 
                                type="checkbox" 
                                checked={item.useSystemVoltage}
                                onChange={(e) => updateLoad(item.id, 'useSystemVoltage', e.target.checked)}
                              />
                              跟随系统
                            </label>
                            <input
                              type="number"
                              className={`w-full text-xs border rounded p-1 ${item.useSystemVoltage ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white focus:border-blue-300 outline-none'}`}
                              value={item.useSystemVoltage ? config.systemVoltage : item.voltage}
                              disabled={item.useSystemVoltage}
                              onChange={(e) => updateLoad(item.id, 'voltage', parseFloat(e.target.value))}
                            />
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 items-center">
                            <select 
                              className="text-xs bg-slate-100 border rounded px-1 py-1"
                              value={item.inputMode}
                              onChange={(e) => updateLoad(item.id, 'inputMode', e.target.value)}
                            >
                              <option value={InputMode.KW}>KW</option>
                              <option value={InputMode.AMP}>A</option>
                            </select>
                            
                            {item.inputMode === InputMode.KW ? (
                              <input 
                                type="number" step="0.1"
                                className="w-full bg-transparent text-center outline-none border-b border-dashed border-slate-300 focus:border-blue-500"
                                placeholder="kW"
                                value={item.powerKw}
                                onChange={(e) => updateLoad(item.id, 'powerKw', parseFloat(e.target.value))}
                              />
                            ) : (
                              <input 
                                type="number" step="0.1"
                                className="w-full bg-transparent text-center outline-none border-b border-dashed border-slate-300 focus:border-blue-500 text-blue-600"
                                placeholder="Amps"
                                value={item.ratedAmps}
                                onChange={(e) => updateLoad(item.id, 'ratedAmps', parseFloat(e.target.value))}
                              />
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <input 
                            type="number"
                            className="w-full bg-transparent text-center font-medium outline-none"
                            value={item.quantity}
                            onChange={(e) => updateLoad(item.id, 'quantity', parseInt(e.target.value))}
                          />
                        </td>
                        <td className="p-3 text-xs text-blue-600 font-mono">
                           {getRowRecommendation(item, config.systemVoltage)}
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" step="0.1" max="1"
                            className="w-full bg-transparent text-center outline-none"
                            value={item.kx}
                            onChange={(e) => updateLoad(item.id, 'kx', parseFloat(e.target.value))}
                          />
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" step="0.01" max="1"
                            className="w-full bg-transparent text-center outline-none"
                            value={item.cosPhi}
                            onChange={(e) => updateLoad(item.id, 'cosPhi', parseFloat(e.target.value))}
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center">
                            <input 
                              type="checkbox"
                              checked={item.uses24V}
                              onChange={(e) => updateLoad(item.id, 'uses24V', e.target.checked)}
                              className="mr-2"
                            />
                            {item.uses24V && (
                              <input 
                                type="number" step="0.1"
                                className="w-12 text-center border-b border-slate-200 text-xs"
                                value={item.current24V}
                                onChange={(e) => updateLoad(item.id, 'current24V', parseFloat(e.target.value))}
                              />
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right font-medium text-slate-700">
                          {calculateRowActivePower(item, config.systemVoltage).toFixed(2)}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => saveToLibrary(item)}
                              className="text-slate-400 hover:text-blue-500 transition-colors"
                              title="保存到我的库"
                            >
                              <Save size={16} />
                            </button>
                            <button 
                              onClick={() => removeLoad(item.id)}
                              className="text-slate-400 hover:text-red-500 transition-colors"
                              title="删除此行"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === item.id && (
                        <tr>
                          <td colSpan={13} className="p-0 animate-fadeIn">
                             {renderFormulaDetails(item)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {loads.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  暂无负载，请点击右上角添加
                </div>
              )}
            </div>
            
            <div className="bg-blue-50 p-3 mt-4 text-xs text-blue-700 rounded flex gap-2">
               <Info size={16} />
               <span>提示：点击最左侧的 <ChevronRight size={12} className="inline"/> 图标可查看单行负载的详细计算公式。点击行右侧 <Save size={12} className="inline"/> 可保存到库。</span>
            </div>
          </div>
        </div>

        {/* 右侧：计算结果区 (占4列) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* 核心结果卡片 */}
          <div className="bg-slate-850 text-white rounded-xl shadow-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Zap size={120} />
            </div>
            
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 border-b border-slate-700 pb-2">
              <Calculator size={20} /> 计算结果汇总
            </h2>

            <div className="space-y-6 relative z-10">
              <div className="flex justify-between items-end">
                <span className="text-slate-400 text-sm">计入有功总功率</span>
                <span className="text-3xl font-bold text-green-400">{result?.totalActivePower} <span className="text-sm text-green-600 font-normal">kW</span></span>
              </div>

              <div className="flex justify-between items-end">
                <span className="text-slate-400 text-sm">进线电流 (含裕量)</span>
                <span className="text-4xl font-bold text-yellow-400">{result?.mainCurrent} <span className="text-sm text-yellow-600 font-normal">A</span></span>
              </div>

              <div className="pt-4 border-t border-slate-700">
                <div className="mb-1 text-xs uppercase tracking-wider text-slate-500 font-bold">推荐选型</div>
                <div className="grid gap-3">
                  <div className="bg-slate-700/50 p-3 rounded border border-slate-600">
                    <div className="text-xs text-slate-400 mb-1">进线空开 (QF)</div>
                    <div className="font-mono text-lg font-semibold text-white">{result?.mainBreaker}</div>
                  </div>
                  
                  <div className="bg-slate-700/50 p-3 rounded border border-slate-600">
                    <div className="text-xs text-slate-400 mb-1">主进线电缆 (相线+PE)</div>
                    <div className="font-mono text-lg font-semibold text-blue-300 break-words">
                      {result?.mainCable}
                    </div>
                  </div>
                </div>
              </div>

               <div className="pt-2 border-t border-slate-700">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-400">DC24V 总负载 (含裕量)</span>
                  <span className="font-mono text-white">{result?.dc24v.recommendedCurrent} A</span>
                </div>
                <div className="text-sm text-yellow-300 font-medium">
                   👉 {result?.dc24v.description}
                </div>
              </div>
            </div>
          </div>

          {/* 铭牌预览卡片 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4 text-slate-700 font-semibold">
              <FileText size={18} />
              <h2>铭牌内容生成</h2>
            </div>
            <textarea 
              readOnly
              className="w-full h-40 bg-slate-50 border rounded p-3 font-mono text-sm text-slate-600 resize-none focus:outline-none"
              value={nameplateText}
            />
            <div className="mt-2 text-xs text-slate-400 text-center">
              可直接复制用于CAD图纸或铭牌制作
            </div>
          </div>

        </div>
      </div>

      {/* 负载库 Modal */}
      {isLibraryOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Book className="text-blue-600" /> 负载设备库
              </h3>
              <button onClick={() => setIsLibraryOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 bg-slate-50">
              {/* 按类型分组展示 */}
              {Object.keys(groupedLibrary).length === 0 ? (
                <div className="text-center py-10 text-slate-400 border-2 border-dashed rounded-lg mx-4">
                  <p>您的库是空的。</p>
                  <p className="text-sm mt-2">在主表格中点击行右侧的 <Save size={14} className="inline"/> 按钮，将常用设备保存到这里。</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedLibrary).map(([type, items]) => (
                    <div key={type} className="bg-white rounded-lg">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1 border-b pb-1 border-slate-100">
                        {type} ({(items as LibraryItem[]).length})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(items as LibraryItem[]).map((libItem) => (
                          <div key={libItem.libId} className="bg-white p-3 rounded border hover:border-blue-400 hover:shadow-md transition-all group relative">
                             {/* 导入区 - 点击卡片主体 */}
                             <div className="cursor-pointer h-full" onClick={() => importFromLibrary(libItem)}>
                                <div className="font-bold text-slate-700 pr-8">
                                  <span>{libItem.name}</span>
                                </div>
                                <div className="text-xs text-slate-500 mt-2 pb-2">
                                  {libItem.inputMode === InputMode.KW ? `${libItem.powerKw} kW` : `${libItem.ratedAmps} A`} | {libItem.voltage}V {libItem.useSystemVoltage ? '(跟随系统)' : ''}
                                </div>
                             </div>
                             
                             {/* 删除按钮 */}
                             <button 
                                onClick={(e) => { e.stopPropagation(); deleteFromLibrary(libItem.libId); }}
                                className="absolute top-2 right-2 z-20 bg-white text-slate-300 hover:text-red-600 p-1.5 rounded-full border border-transparent hover:border-red-100 hover:bg-red-50 transition-all shadow-sm"
                                title="从库中删除"
                             >
                               <Trash2 size={14} />
                             </button>

                             {/* 导入图标 (右下角) */}
                             <div className="absolute bottom-2 right-2 z-10 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <Download size={16} />
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-slate-50 rounded-b-xl text-right text-xs text-slate-500 flex justify-between items-center">
               <span className="text-slate-400">数据保存在本地浏览器中</span>
               <span>点击卡片即可导入到当前项目清单</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}