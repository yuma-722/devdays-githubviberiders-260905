using System.Globalization;

namespace Survey;

public static class SurveyAggregator
{
    public static SurveyResults Aggregate(IReadOnlyList<SurveyDocument> surveys)
    {
        Dictionary<string, int> roles = SurveyOptions.JobRoles
            .ToDictionary(value => value, _ => 0, StringComparer.Ordinal);
        Dictionary<string, int> distribution = Enumerable.Range(1, 5)
            .ToDictionary(value => value.ToString(CultureInfo.InvariantCulture), _ => 0, StringComparer.Ordinal);
        List<FeedbackResult> feedback = [];
        long ratingSum = 0;

        foreach (SurveyDocument survey in surveys)
        {
            SurveyDocumentValidator.Validate(survey);
            foreach (string role in survey.JobRole.Distinct(StringComparer.Ordinal))
            {
                roles[role]++;
            }
            distribution[survey.EventRating.ToString(CultureInfo.InvariantCulture)]++;
            ratingSum += survey.EventRating;
            if (!string.IsNullOrWhiteSpace(survey.Feedback))
            {
                feedback.Add(new FeedbackResult(survey.Id, survey.Feedback, survey.CreatedAt.ToUniversalTime()));
            }
        }

        return new SurveyResults(surveys.Count, roles,
            new RatingResults(surveys.Count == 0 ? 0 : (double)ratingSum / surveys.Count, distribution),
            feedback.OrderByDescending(item => item.Timestamp).ThenBy(item => item.Id, StringComparer.Ordinal).ToArray());
    }
}

public static class SurveyDocumentValidator
{
    public static void Validate(SurveyDocument survey)
    {
        if (string.IsNullOrWhiteSpace(survey.Id)
            || survey.CreatedAt == default || survey.UpdatedAt == default
            || survey.CreatedAt.Kind != DateTimeKind.Utc || survey.UpdatedAt.Kind != DateTimeKind.Utc
            || survey.Date != survey.CreatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            || survey.JobRole is null || survey.Feedback is null)
        {
            throw new InvalidDataException("保存済みアンケートのデータ形式が不正です。");
        }
        try
        {
            SurveyRequestParser.ValidateRules(
                survey.JobRole, survey.JobRoleOther, survey.EventRating, survey.Feedback);
        }
        catch (SurveyRequestException exception)
        {
            throw new InvalidDataException("保存済みアンケートがバリデーションに違反しています。", exception);
        }
    }
}
