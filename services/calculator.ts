/**
 * services/calculator.ts
 * 对应你要求的 calculators.py
 * 包含所有核心电气计算逻辑
 */

import { LoadItem, ProjectConfig, CalculationResult, DC24VResult, LoadType, InputMode } from '../types';
import { CABLE_TABLE, BREAKER_SIZES, CONTACTOR_TABLE } from '../data/tables';

// ------------------------------------------------------------------
// 0. 辅助：获取等效功率 (kW) 与 有效电压
// ------------------------------------------------------------------

/**
 * 获取负载的有效电压
 * 如果勾选了"使用系统电压"，则返回系统电压，否则返回负载设定电压
 */
export const getEffectiveVoltage = (item: LoadItem, systemVoltage: number): number => {
  return item.useSystemVoltage ? systemVoltage : item.voltage;
};

/**
 * 获取单台设备的等效额定功率 (kW)
 * 如果用户输入的是电流，则反推功率
 */
export const getItemEquivalentKw = (item: LoadItem, systemVoltage: number): number => {
  if (item.inputMode === InputMode.KW) {
    return item.powerKw;
  } 
  
  // AMP 模式：需要计算 P = I * U * ...
  if (item.inputMode === InputMode.AMP) {
    const u = getEffectiveVoltage(item, systemVoltage);
    const i = item.ratedAmps;
    const cos = item.cosPhi || 0.8;
    
    // Heuristic: treat >= 300V as 3-phase (root3), < 300V as 1-phase
    if (u >= 300) {
      // P = I * U * 1.732 * cos / 1000
      return (i * u * 1.732 * cos) / 1000;
    } else {
      // P = I * U * cos / 1000
      return (i * u * cos) / 1000;
    }
  }
  
  return 0;
};

// ------------------------------------------------------------------
// 1. 基础功率计算
// ------------------------------------------------------------------

/**
 * 计算单行负载的“计入功率”
 * 公式: 等效功率(kW) × 数量 × 同时系数 (Kx)
 */
export const calculateRowActivePower = (item: LoadItem, systemVoltage: number): number => {
  const p = getItemEquivalentKw(item, systemVoltage);
  return p * item.quantity * item.kx;
};

// ------------------------------------------------------------------
// 2. 总功率与电流计算
// ------------------------------------------------------------------

/**
 * 计算整机进线电流
 * 逻辑：
 * 1. 累加所有负载的计入功率 (Total Active Power)
 * 2. 考虑裕量系数
 * 3. 根据公式计算电流：
 *    - 380V (三相): I = P / (√3 * U * cosφ)
 *    - 220V (单相): I = P / (U * cosφ)
 */
export const performSystemCalculation = (
  loads: LoadItem[], 
  config: ProjectConfig
): CalculationResult => {
  
  // 1. 计算总有功功率 (kW)
  // sum(每个负载的等效功率 * 数量 * 同时系数)
  const rawActivePower = loads.reduce((sum, item) => {
    return sum + calculateRowActivePower(item, config.systemVoltage);
  }, 0);

  // 2. 计算加了裕量后的功率 (用于选空开和电缆)
  // 这里按你的Excel逻辑：总功率 * 裕量
  const totalDesignPower = rawActivePower * config.marginFactor;

  // 3. 计算加权平均功率因数 (简化处理，通常取0.8或按主要负载)
  // 这里为了严谨，计算总视在功率 S = P / cosφ
  let totalS = 0;
  loads.forEach(item => {
    const p = calculateRowActivePower(item, config.systemVoltage);
    // 防止除以0
    const cos = item.cosPhi || 0.8;
    totalS += p / cos;
  });
  
  // 如果没有负载，避免NaN
  if (totalS === 0) totalS = 0.1;

  // 系统平均功率因数
  const avgCosPhi = rawActivePower / totalS || 0.8;
  
  // 4. 计算进线电流 (A)
  let mainCurrent = 0;
  
  if (config.systemVoltage === 220) {
    // 220V 单相公式: I = P(kW) * 1000 / (220 * cosφ)
    mainCurrent = (totalDesignPower * 1000) / (config.systemVoltage * avgCosPhi);
  } else {
    // 380V 三相公式: I = P(kW) * 1000 / (1.732 * 380 * cosφ)
    const root3 = 1.732;
    mainCurrent = (totalDesignPower * 1000) / (root3 * config.systemVoltage * avgCosPhi);
  }

  // 5. 选型子模块调用 (传入电压以决定 2P/3P 和 电缆芯数)
  const mainBreaker = selectMainBreaker(mainCurrent, config.systemVoltage);
  const mainCable = selectCable(mainCurrent, config.cableSafetyFactor, config.systemVoltage);
  const dc24v = calculateDC24V(loads);

  return {
    totalActivePower: Number(rawActivePower.toFixed(2)),
    totalApparentPower: Number((rawActivePower / avgCosPhi).toFixed(2)),
    mainCurrent: Number(mainCurrent.toFixed(1)),
    mainBreaker,
    mainCable,
    dc24v
  };
};

// ------------------------------------------------------------------
// 3. 空开与电缆选型
// ------------------------------------------------------------------

/**
 * 推荐主空开
 * 规则：查找比计算电流大的最近一级标准规格
 */
const selectMainBreaker = (current: number, voltage: number): string => {
  // 简单规则：空开额定电流 > 计算电流
  const size = BREAKER_SIZES.find(s => s >= current);
  
  if (!size) return '> 630A (需定制)';
  
  // 根据电压决定极数
  // 220V -> 2P (火+零)
  // 380V -> 3P (三火)
  const poles = voltage === 220 ? '2P' : '3P';
  
  return `${poles} - ${size}A`;
};

/**
 * 查表选择电缆
 * 规则：电缆允许载流量 > 计算电流 * 电缆安全系数
 */
const selectCable = (current: number, safetyFactor: number, voltage: number): string => {
  const targetCurrent = current * safetyFactor;
  
  // 在表中查找
  const cableEntry = CABLE_TABLE.find(([_, maxAmp]) => maxAmp >= targetCurrent);
  
  if (!cableEntry) {
    return '需多根并联或母排';
  }
  
  const phaseMm2 = cableEntry[0];
  const peMm2 = getPESize(phaseMm2);
  
  // 格式化输出
  if (voltage === 220) {
    // 220V 单相: 2根载流线 (L+N) + 1根地线
    return `2×${phaseMm2}mm² + 1×${peMm2}mm²`;
  } else {
    // 380V 三相: 3根载流线 + 1根地线 (通常不含零线的主电缆写法，若含零线则为4x或3x+1xN)
    return `3×${phaseMm2}mm² + 1×${peMm2}mm²`;
  }
};

/**
 * 根据相线截面选择 PE 线截面
 * 规则(GB/IEC标准):
 * S <= 16  -> PE = S
 * 16 < S <= 35 -> PE = 16
 * S > 35 -> PE = S/2
 */
const getPESize = (phaseMm2: number): number => {
  if (phaseMm2 <= 16) return phaseMm2;
  if (phaseMm2 <= 35) return 16;
  return phaseMm2 / 2;
};

// ------------------------------------------------------------------
// 4. DC24V 电源计算
// ------------------------------------------------------------------

const calculateDC24V = (loads: LoadItem[]): DC24VResult => {
  let totalAmps = 0;
  
  loads.forEach(item => {
    if (item.uses24V) {
      totalAmps += item.current24V * item.quantity;
    }
  });

  // 电源建议留 20%-30% 裕量
  const recommended = totalAmps * 1.3;
  
  // 简单推荐逻辑
  let desc = '';
  if (recommended <= 2.5) desc = '60W (2.5A) 电源';
  else if (recommended <= 5) desc = '120W (5A) 电源';
  else if (recommended <= 10) desc = '240W (10A) 电源';
  else if (recommended <= 20) desc = '480W (20A) 电源';
  else desc = `${Math.ceil(recommended)}A 以上，建议并联或大功率电源`;

  return {
    totalCurrent: Number(totalAmps.toFixed(2)),
    recommendedCurrent: Number(recommended.toFixed(2)),
    description: desc
  };
};

// ------------------------------------------------------------------
// 5. 辅助：单负载推荐 (用于列表展示)
// ------------------------------------------------------------------

export const getRowRecommendation = (item: LoadItem, systemVoltage: number): string => {
  const effectiveVoltage = getEffectiveVoltage(item, systemVoltage);
  const kw = getItemEquivalentKw(item, systemVoltage);

  if (item.type === LoadType.MOTOR) {
    // 查找接触器
    const entry = CONTACTOR_TABLE.slice().reverse().find(([k, _]) => kw >= k);
    const contactor = entry ? entry[1] : 'CJX2-09'; // 最小默认09
    
    // 估算电机电流
    let i_motor = 0;
    if (item.inputMode === InputMode.AMP) {
       i_motor = item.ratedAmps;
    } else {
       // 简易估算:
       // 如果电压 >= 300V，按三相估算 (I = P / (1.732 * U * 0.8))
       // 如果电压 < 300V，按单相估算 (I = P / (U * 0.8? or 1.0? usually motor 0.8))
       // 380V下: 1000 / (1.732*380*0.8) ≈ 1.9A (近似2A)
       // 220V下: 1000 / (220*0.8) ≈ 5.6A (按cos0.8) 或者按经验值
       
       const isThreePhase = effectiveVoltage >= 300;
       const root3 = isThreePhase ? 1.732 : 1.0;
       
       // 通用物理公式估算
       const factor = 1000 / (root3 * effectiveVoltage * 0.8);
       i_motor = kw * factor; 
    }

    // 电机回路空开通常选 D型，电流 1.5-2倍
    const breakerSize = BREAKER_SIZES.find(s => s > i_motor * 1.5) || 63;
    
    return `接触器:${contactor} / 空开:D${breakerSize}`;
  }
  
  if (item.type === LoadType.HEATER) {
    let i_heat = 0;
    if (item.inputMode === InputMode.AMP) {
        i_heat = item.ratedAmps;
    } else {
        const isThreePhase = effectiveVoltage >= 300;
        const root3 = isThreePhase ? 1.732 : 1.0;
        // P = U * I * root3 (Heater cos=1)
        i_heat = (kw * 1000) / (effectiveVoltage * root3);
    }
    return `电流约 ${i_heat.toFixed(1)}A`;
  }

  // 其他类型，如果输入了电流，回显一下
  if (item.inputMode === InputMode.AMP) {
      return `额定电流 ${item.ratedAmps}A`;
  }

  return '-';
};