export type StaffingRole="lead"|"assistant";

export type RecommendationPriorityKey=
  |"availability"
  |"previous_coach"
  |"lower_staffing_cost"
  |"recommended_qualification"
  |"organisation_match"
  |"weekly_hours";

export type RecommendationPriority={key:RecommendationPriorityKey;weight:number};

export const DEFAULT_RECOMMENDATION_PRIORITIES:RecommendationPriority[]=[
  {key:"availability",weight:35},
  {key:"previous_coach",weight:20},
  {key:"lower_staffing_cost",weight:10},
  {key:"recommended_qualification",weight:0}
];

export type CoachRecommendationInput={
  coachId:string;
  coachName:string;
  role:StaffingRole;
  classDurationHours:number;
  hourlyRate:number;
  isAvailable:boolean;
  isAssignedElsewhere:boolean;
  approvedTimeAway?:boolean;
  pendingTimeAway?:boolean;
  previousSessionCount:number;
  exactSessionCount?:number;
  sameProgrammeSessionCount?:number;
  programmeName?:string;
  worksAtOrganisation:boolean;
  qualificationIds:string[];
  recommendedQualificationId?:string|null;
  qualifications?:QualificationDescriptor[];
  recommendedQualification?:QualificationDescriptor|null;
  dailyAssignedHours:number;
  weeklyAssignedHours:number;
};

export type QualificationDescriptor={
  id:string;
  family?:string|null;
  level?:number|null;
};

export function qualificationSatisfies(held:QualificationDescriptor,required:QualificationDescriptor):boolean{
  if(held.id===required.id)return true;
  const heldFamily=held.family?.trim().toLocaleLowerCase();
  const requiredFamily=required.family?.trim().toLocaleLowerCase();
  return Boolean(
    heldFamily&&requiredFamily&&heldFamily===requiredFamily&&
    held.level!=null&&required.level!=null&&held.level>=required.level
  );
}

export type CoachRecommendation={
  coachId:string;
  coachName:string;
  score:number;
  estimatedStaffingCost:number;
  reasons:string[];
  warnings:string[];
};

const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));

/**
 * Pure, side-effect-free recommendation scoring. It ranks information only and
 * deliberately has no assignment capability. Callers remain responsible for all
 * existing availability checks and administrator decisions.
 */
export function recommendCoach(
  input:CoachRecommendationInput,
  priorities:RecommendationPriority[]=DEFAULT_RECOMMENDATION_PRIORITIES
):CoachRecommendation{
  const reasons:string[]=[];
  const warnings:string[]=[];
  const required=input.recommendedQualification;
  const hasQualification=!input.recommendedQualificationId||input.qualificationIds.includes(input.recommendedQualificationId)||Boolean(
    required&&input.qualifications?.some(held=>qualificationSatisfies(held,required))
  );
  const exactSessionCount=input.exactSessionCount??input.previousSessionCount;
  const sameProgrammeSessionCount=input.sameProgrammeSessionCount??0;
  const previousCoachFactor=exactSessionCount>0
    ?.75+.25*clamp(exactSessionCount/10)
    :sameProgrammeSessionCount>0
      ?.4+.2*clamp(sameProgrammeSessionCount/10)
      :0;
  const factors:Record<RecommendationPriorityKey,number>={
    availability:input.isAvailable&&!input.isAssignedElsewhere&&!input.approvedTimeAway?1:0,
    previous_coach:previousCoachFactor,
    lower_staffing_cost:clamp(1-input.hourlyRate/100),
    recommended_qualification:hasQualification?1:0,
    organisation_match:input.worksAtOrganisation?1:0,
    weekly_hours:clamp(1-input.weeklyAssignedHours/40)
  };
  const totalWeight=priorities.reduce((sum,item)=>sum+Math.max(0,item.weight),0)||1;
  const weighted=priorities.reduce((sum,item)=>sum+factors[item.key]*Math.max(0,item.weight),0);

  if(input.isAvailable)reasons.push("Available");
  if(exactSessionCount>0)reasons.push(`Usually coaches this session (${exactSessionCount} session${exactSessionCount===1?"":"s"})`);
  else if(sameProgrammeSessionCount>0)reasons.push(`Has coached ${input.programmeName?.trim()||"this programme"} before (${sameProgrammeSessionCount} session${sameProgrammeSessionCount===1?"":"s"})`);
  if(input.worksAtOrganisation)reasons.push("Organisation match");
  if(hasQualification&&input.recommendedQualificationId)reasons.push("Recommended qualification");
  reasons.push(`Estimated staffing cost £${Math.max(0,input.classDurationHours*input.hourlyRate).toFixed(2)}`);
  if(factors.lower_staffing_cost>=.75)reasons.push("Lower staffing cost");

  if(input.approvedTimeAway)warnings.push("Approved time away conflicts with this class");
  else if(input.pendingTimeAway)warnings.push("Pending time away may conflict with this class");
  if(input.isAssignedElsewhere)warnings.push("Already assigned elsewhere at this time");
  if(!input.isAvailable&&!input.approvedTimeAway)warnings.push("Not currently available");
  if(!hasQualification)warnings.push("Does not hold the recommended qualification");
  if(input.dailyAssignedHours>=5)warnings.push(`Already coaching ${input.dailyAssignedHours.toFixed(2)} hours that day`);
  if(input.weeklyAssignedHours>=20)warnings.push(`Already assigned ${input.weeklyAssignedHours.toFixed(2)} hours that week`);

  return{
    coachId:input.coachId,
    coachName:input.coachName,
    score:Math.round(clamp(weighted/totalWeight)*100),
    estimatedStaffingCost:Number(Math.max(0,input.classDurationHours*input.hourlyRate).toFixed(2)),
    reasons,
    warnings
  };
}

export function rankCoachRecommendations(
  inputs:CoachRecommendationInput[],
  priorities:RecommendationPriority[]=DEFAULT_RECOMMENDATION_PRIORITIES
):CoachRecommendation[]{
  return inputs
    .map(input=>recommendCoach(input,priorities))
    .sort((a,b)=>b.score-a.score||a.estimatedStaffingCost-b.estimatedStaffingCost||a.coachName.localeCompare(b.coachName));
}
