namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class GenerateDates : DbMigration
    {
        public override void Up()
        {
            AlterColumn("dbo.Budgets", "CreatedDate", n => n.DateTime(nullable: true, defaultValueSql: "GETDATE()"));
            AlterColumn("dbo.Expenses", "DateCreated", n => n.DateTime(nullable: true, defaultValueSql: "GETDATE()"));
        }
        
        public override void Down()
        {
            AlterColumn("dbo.Budgets", "CreatedDate", n => n.DateTime(nullable: true, defaultValueSql: null));
            AlterColumn("dbo.Expenses", "DateCreated", n => n.DateTime(nullable: true, defaultValueSql: null));
        }
    }
}
