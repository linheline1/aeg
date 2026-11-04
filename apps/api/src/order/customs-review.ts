import { BadRequestException } from '@nestjs/common';

export function pendingCustomsReview(totalDiBrl: number | null = null) {
  return {
    status: 'pending' as const,
    di_review_version: null,
    total_di_brl: totalDiBrl,
    note: null,
    reviewed_by: null,
    reviewed_at: null
  };
}

export function hasCurrentCustomsApproval(order: any): boolean {
  const reviewVersion = Number(order?.di_analysis?.review_version);
  return order?.di_analysis?.status === 'reviewed'
    && order?.customs_review?.status === 'approved'
    && Number.isInteger(reviewVersion)
    && reviewVersion > 0
    && Number(order.customs_review.di_review_version) === reviewVersion;
}

export function assertCurrentCustomsApproval(order: any): void {
  if (!hasCurrentCustomsApproval(order)) {
    throw new BadRequestException('当前 DI 尚未经报关行确认，或确认后数据已变更；请等待报关行重新确认');
  }
}
