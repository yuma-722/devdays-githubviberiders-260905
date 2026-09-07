using System.Globalization;
using System.Text.Json;

namespace Survey;

public static class SurveyOptions
{
    public const string OtherJobRole = "その他";
    public static IReadOnlyList<string> JobRoles { get; } = Array.AsReadOnly([
        "フロントエンドエンジニア", "バックエンドエンジニア", "フルスタックエンジニア",
        "DevOpsエンジニア", "データエンジニア", "モバイルエンジニア", OtherJobRole
    ]);
}

public static class SurveyJson
{
    public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = false,
        RespectNullableAnnotations = true
    };
}

public sealed record SurveyInput(
    string[] JobRole,
    string? JobRoleOther,
    int EventRating,
    string? Feedback);

public sealed record SurveyDocument
{
    public required string Id { get; init; }
    public required string Date { get; init; }
    public required string[] JobRole { get; init; }
    public string? JobRoleOther { get; init; }
    public required int EventRating { get; init; }
    public required string Feedback { get; init; }
    public required DateTime CreatedAt { get; init; }
    public required DateTime UpdatedAt { get; init; }

    public static SurveyDocument Create(SurveyInput input, TimeProvider clock)
    {
        DateTime now = clock.GetUtcNow().UtcDateTime;
        return new SurveyDocument
        {
            Id = Guid.NewGuid().ToString(),
            Date = now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            JobRole = input.JobRole.Distinct(StringComparer.Ordinal).ToArray(),
            JobRoleOther = input.JobRoleOther,
            EventRating = input.EventRating,
            Feedback = input.Feedback ?? string.Empty,
            CreatedAt = now,
            UpdatedAt = now
        };
    }
}

public sealed record SurveyResults(
    int TotalResponses,
    Dictionary<string, int> JobRole,
    RatingResults EventRating,
    IReadOnlyList<FeedbackResult> Feedback);

public sealed record RatingResults(double Average, Dictionary<string, int> Distribution);
public sealed record FeedbackResult(string Id, string Feedback, DateTime Timestamp);
public sealed record ApiError(bool Success, string Error, string Code);
public sealed record CreateSurveyResponse(bool Success, string Message, string SurveyId);
public sealed record SurveyResultsResponse(bool Success, SurveyResults Data);
