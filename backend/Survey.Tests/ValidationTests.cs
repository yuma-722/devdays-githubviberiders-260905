using System.Net;
using System.Text.Json;

namespace Survey.Tests;

public sealed class ValidationTests
{
    public static IEnumerable<object[]> InvalidFields()
    {
        foreach (string field in new[] { "communityAffiliation", "jobRole", "eventRating" })
        {
            Dictionary<string, object?> missing = TestData.Input();
            missing.Remove(field);
            yield return [TestData.Json(missing), 422];
            yield return [With(field, null), 422];
        }
        foreach (string field in new[] { "communityAffiliation", "jobRole" })
        {
            foreach (object value in new object[] { "invalid", 1, true, new { }, new object?[] { null }, new[] { 1 } })
            {
                yield return [With(field, value), 400];
            }
            yield return [With(field, new[] { "unknown" }), 422];
        }
        yield return [With("jobRole", Array.Empty<string>()), 422];
        foreach (object value in new object[] { "5", 1.5, true, new[] { 5 }, new { }, 2147483648L })
        {
            yield return [With("eventRating", value), 400];
        }
        yield return [With("eventRating", 0), 422];
        yield return [With("eventRating", 6), 422];
        foreach (string field in new[] { "jobRoleOther", "feedback" })
        {
            yield return [With(field, 123), 400];
            yield return [With(field, new[] { "text" }), 400];
        }
        yield return [With("feedback", new string('a', 1001)), 422];
        yield return [With("jobRoleOther", new string('a', 101)), 422];
        foreach (string? value in new string?[] { null, "", " \t\r\n" })
        {
            Dictionary<string, object?> input = TestData.Input();
            input["jobRole"] = new[] { SurveyOptions.OtherJobRole };
            input["jobRoleOther"] = value;
            yield return [TestData.Json(input), 422];
        }
        yield return ["null", 400];
        yield return ["[]", 400];
        yield return ["1", 400];
        yield return ["\"text\"", 400];
        yield return [TestData.Json().Replace("\"eventRating\":5", "\"eventRating\":1.0"), 400];
    }

    [Theory]
    [MemberData(nameof(InvalidFields))]
    public async Task RejectsInvalidFields(string json, int status)
    {
        using MemoryStream body = TestData.Stream(json);
        SurveyRequestException error = await Assert.ThrowsAsync<SurveyRequestException>(
            () => SurveyRequestParser.ParseAsync(body));
        Assert.Equal((HttpStatusCode)status, error.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("{")]
    [InlineData("{\"eventRating\":NaN}")]
    public async Task RejectsMalformedJson(string json)
    {
        using MemoryStream body = TestData.Stream(json);
        await Assert.ThrowsAnyAsync<JsonException>(() => SurveyRequestParser.ParseAsync(body));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    public async Task AcceptsBoundariesAndDeduplicates(int rating)
    {
        Dictionary<string, object?> input = TestData.Input();
        input["communityAffiliation"] = new[] { SurveyOptions.Communities[0], SurveyOptions.Communities[0] };
        input["jobRole"] = new[] { SurveyOptions.OtherJobRole, SurveyOptions.OtherJobRole };
        input["jobRoleOther"] = new string('a', 100);
        input["feedback"] = new string('a', 1000);
        input["eventRating"] = rating;
        using MemoryStream body = TestData.Stream(TestData.Json(input));
        SurveyInput result = await SurveyRequestParser.ParseAsync(body);
        Assert.Single(result.CommunityAffiliation);
        Assert.Single(result.JobRole);
        Assert.Equal(100, result.JobRoleOther!.Length);
        Assert.Equal(1000, result.Feedback!.Length);
        Assert.Equal(rating, result.EventRating);
    }

    [Fact]
    public async Task AcceptsAllChoicesAndOptionalNulls()
    {
        Dictionary<string, object?> input = TestData.Input();
        input["communityAffiliation"] = SurveyOptions.Communities;
        input["jobRole"] = SurveyOptions.JobRoles;
        input["jobRoleOther"] = "講師";
        input["feedback"] = null;
        using MemoryStream body = TestData.Stream(TestData.Json(input));
        SurveyInput result = await SurveyRequestParser.ParseAsync(body);
        Assert.Equal(2, result.CommunityAffiliation.Length);
        Assert.Equal(7, result.JobRole.Length);
        Assert.Null(result.Feedback);
    }

    [Fact]
    public async Task IgnoresClientSuppliedIdentityAndTimestamps()
    {
        Dictionary<string, object?> input = TestData.Input();
        input["id"] = "client-id";
        input["date"] = "wrong";
        input["createdAt"] = "wrong";
        input["updatedAt"] = "wrong";
        using MemoryStream body = TestData.Stream(TestData.Json(input));
        SurveyDocument survey = SurveyDocument.Create(await SurveyRequestParser.ParseAsync(body), new FixedClock());
        Assert.True(Guid.TryParse(survey.Id, out _));
        Assert.NotEqual("client-id", survey.Id);
        Assert.Equal("2026-09-05", survey.Date);
        Assert.Equal(DateTimeKind.Utc, survey.CreatedAt.Kind);
        Assert.Equal(new FixedClock().GetUtcNow().UtcDateTime, survey.CreatedAt);
        Assert.Equal(survey.CreatedAt, survey.UpdatedAt);
    }

    private static string With(string field, object? value)
    {
        Dictionary<string, object?> input = TestData.Input();
        input[field] = value;
        return TestData.Json(input);
    }
}
