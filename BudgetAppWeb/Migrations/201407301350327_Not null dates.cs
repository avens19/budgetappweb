namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class Notnulldates : DbMigration
    {
        public override void Up()
        {
            AlterColumn("dbo.Budgets", "CreatedDate", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Expenses", "DateCreated", c => c.DateTime(nullable: false));
        }
        
        public override void Down()
        {
            AlterColumn("dbo.Expenses", "DateCreated", c => c.DateTime());
            AlterColumn("dbo.Budgets", "CreatedDate", c => c.DateTime());
        }
    }
}
